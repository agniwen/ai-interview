import * as lark from "@larksuiteoapi/node-sdk";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
} from "@arc/db-schema/interview-notifications";
import { interviewNotification, interviewNotificationEvent } from "@arc/db-schema/schema";
import { InterviewNotificationProviderError } from "@arc/shared/interview-notifications";
import { Resend } from "resend";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type {
  InterviewNotificationDeliveryRecord,
  InterviewNotificationProcessorPorts,
} from "../background-workloads/processors/interview-notification.processor.js";

const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Interview notification provider is not configured: ${name} is required`);
  }
  return value;
}

function resendFailure(error: { message?: string; name?: string }) {
  const code = error.name ?? "resend-error";
  const retryable = [
    "application_error",
    "concurrent_idempotent_requests",
    "internal_server_error",
    "rate_limit_exceeded",
  ].includes(code);
  return new InterviewNotificationProviderError({
    code: `resend-${code}`,
    kind: retryable ? "retryable" : "permanent",
    message: error.message ?? "邮件供应商发送失败。",
  });
}

export class InterviewNotificationInfrastructure implements InterviewNotificationProcessorPorts {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;

  constructor(database: Database, env: NodeJS.ProcessEnv = process.env) {
    this.database = database;
    this.env = env;
  }

  claimEvents(input: { leaseDurationMs: number; leaseOwner: string; limit: number; now: Date }) {
    return this.database.transaction(async (tx) => {
      const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 100);
      const leaseOwner = input.leaseOwner.trim();
      if (!(leaseOwner && Number.isFinite(input.leaseDurationMs) && input.leaseDurationMs > 0)) {
        throw new Error("通知事件租约参数无效。");
      }
      const rows = await tx
        .select()
        .from(interviewNotificationEvent)
        .where(
          and(
            lte(interviewNotificationEvent.availableAt, input.now),
            lte(interviewNotificationEvent.nextAttemptAt, input.now),
            or(
              inArray(interviewNotificationEvent.status, ["pending", "failed"]),
              and(
                eq(interviewNotificationEvent.status, "processing"),
                or(
                  isNull(interviewNotificationEvent.leaseExpiresAt),
                  lte(interviewNotificationEvent.leaseExpiresAt, input.now),
                ),
              ),
            ),
          ),
        )
        .orderBy(
          asc(interviewNotificationEvent.nextAttemptAt),
          asc(interviewNotificationEvent.createdAt),
        )
        .limit(limit)
        .for("update", { skipLocked: true });
      if (rows.length === 0) {
        return [];
      }
      const claimed = await tx
        .update(interviewNotificationEvent)
        .set({
          attemptCount: sql`${interviewNotificationEvent.attemptCount} + 1`,
          lastErrorCode: null,
          lastErrorMessage: null,
          leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
          leaseOwner,
          status: "processing",
          updatedAt: input.now,
        })
        .where(
          inArray(
            interviewNotificationEvent.id,
            rows.map((row) => row.id),
          ),
        )
        .returning();
      const claimedById = new Map(claimed.map((row) => [row.id, row]));
      return rows.flatMap((row) => {
        const updated = claimedById.get(row.id);
        return updated ? [updated] : [];
      });
    });
  }

  listDeliveries(eventId: string): Promise<InterviewNotificationDeliveryRecord[]> {
    return this.database
      .select()
      .from(interviewNotification)
      .where(eq(interviewNotification.eventId, eventId))
      .orderBy(asc(interviewNotification.createdAt))
      .execute();
  }

  async claimDelivery(input: {
    deliveryId: string;
    leaseDurationMs: number;
    leaseOwner: string;
    now: Date;
  }): Promise<InterviewNotificationDeliveryRecord | null> {
    const leaseOwner = input.leaseOwner.trim();
    if (!(leaseOwner && Number.isFinite(input.leaseDurationMs) && input.leaseDurationMs > 0)) {
      throw new Error("通知投递租约参数无效。");
    }
    const [claimed] = await this.database
      .update(interviewNotification)
      .set({
        attemptCount: sql`${interviewNotification.attemptCount} + 1`,
        error: null,
        lastErrorCode: null,
        leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
        leaseOwner,
        status: "sending",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(interviewNotification.id, input.deliveryId),
          or(
            and(
              inArray(interviewNotification.status, ["pending", "failed"]),
              or(
                isNull(interviewNotification.nextAttemptAt),
                lte(interviewNotification.nextAttemptAt, input.now),
              ),
            ),
            and(
              eq(interviewNotification.status, "sending"),
              lte(interviewNotification.leaseExpiresAt, input.now),
            ),
          ),
        ),
      )
      .returning();
    return claimed ?? null;
  }

  async markDeliverySent(input: {
    deliveryId: string;
    leaseOwner: string;
    providerMessageId: string | null;
    sentAt: Date;
  }): Promise<boolean> {
    const [updated] = await this.database
      .update(interviewNotification)
      .set({
        error: null,
        lastErrorCode: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: null,
        providerMessageId: input.providerMessageId,
        sentAt: input.sentAt,
        status: "sent",
        updatedAt: input.sentAt,
      })
      .where(
        and(
          eq(interviewNotification.id, input.deliveryId),
          eq(interviewNotification.leaseOwner, input.leaseOwner),
          eq(interviewNotification.status, "sending"),
        ),
      )
      .returning({ id: interviewNotification.id });
    return Boolean(updated);
  }

  async markDeliveryFailed(input: {
    code: string;
    deliveryId: string;
    leaseOwner: string;
    message: string;
    nextAttemptAt: Date | null;
    status: "dead" | "failed" | "unknown";
  }): Promise<boolean> {
    const now = new Date();
    const [updated] = await this.database
      .update(interviewNotification)
      .set({
        error: input.message,
        lastErrorCode: input.code,
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: input.nextAttemptAt,
        resultUnknownAt: input.status === "unknown" ? now : null,
        status: input.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(interviewNotification.id, input.deliveryId),
          eq(interviewNotification.leaseOwner, input.leaseOwner),
          eq(interviewNotification.status, "sending"),
        ),
      )
      .returning({ id: interviewNotification.id });
    return Boolean(updated);
  }

  async updateEventState(input: {
    completedAt?: Date | null;
    eventId: string;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    leaseOwner: string;
    nextAttemptAt?: Date;
    status: "completed" | "dead" | "failed";
  }): Promise<boolean> {
    const now = new Date();
    const [updated] = await this.database
      .update(interviewNotificationEvent)
      .set({
        completedAt: input.completedAt ?? (input.status === "completed" ? now : null),
        lastErrorCode: input.lastErrorCode ?? null,
        lastErrorMessage: input.lastErrorMessage ?? null,
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: input.nextAttemptAt ?? now,
        status: input.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(interviewNotificationEvent.id, input.eventId),
          eq(interviewNotificationEvent.leaseOwner, input.leaseOwner),
          eq(interviewNotificationEvent.status, "processing"),
        ),
      )
      .returning({ id: interviewNotificationEvent.id });
    return Boolean(updated);
  }

  send(input: {
    address: string;
    audienceType: InterviewNotificationAudienceType;
    channel: InterviewNotificationChannel;
    idempotencyKey: string;
    payload: InterviewNotificationPayloadSnapshot;
    providerId: string;
    renderedContent: string;
    renderedSubject: string | null;
    type: InterviewNotificationEventType;
  }): Promise<{ providerMessageId: string | null }> {
    if (input.channel === "email") {
      return this.sendEmail(input);
    }
    if (input.channel === "feishu") {
      return this.sendFeishu(input);
    }
    throw new InterviewNotificationProviderError({
      code: "sms-provider-not-configured",
      kind: "permanent",
      message: "短信供应商尚未配置。",
    });
  }

  private async sendEmail(input: {
    address: string;
    idempotencyKey: string;
    renderedContent: string;
    renderedSubject: string | null;
  }): Promise<{ providerMessageId: string | null }> {
    if (!input.renderedSubject?.trim()) {
      throw new InterviewNotificationProviderError({
        code: "email-subject-missing",
        kind: "permanent",
        message: "邮件通知缺少主题。",
      });
    }
    let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
    try {
      result = await new Resend(required(this.env, "RESEND_API_KEY")).emails.send(
        {
          from: required(this.env, "RESEND_FROM"),
          subject: input.renderedSubject,
          text: input.renderedContent,
          to: input.address,
        },
        { idempotencyKey: input.idempotencyKey },
      );
    } catch (error) {
      throw new InterviewNotificationProviderError({
        cause: error,
        code: "resend-request-failed",
        kind: "unknown",
        message: "邮件请求结果未知，需要人工核查。",
      });
    }
    if (result.error) {
      throw resendFailure(result.error);
    }
    if (!result.data?.id) {
      throw new InterviewNotificationProviderError({
        code: "resend-result-missing",
        kind: "unknown",
        message: "邮件供应商未返回消息 ID，需要人工核查。",
      });
    }
    return { providerMessageId: result.data.id };
  }

  private async sendFeishu(input: {
    address: string;
    providerId: string;
    renderedContent: string;
  }): Promise<{ providerMessageId: string | null }> {
    if (!FEISHU_PROVIDER_IDS.some((providerId) => providerId === input.providerId)) {
      throw new InterviewNotificationProviderError({
        code: "feishu-provider-invalid",
        kind: "permanent",
        message: "飞书通知供应商配置无效。",
      });
    }
    const secondary = input.providerId === "feishu-jiguang-hr";
    const client = new lark.Client({
      appId: required(this.env, secondary ? "FEISHU_APP_ID2" : "FEISHU_APP_ID"),
      appSecret: required(this.env, secondary ? "FEISHU_APP_SECRET2" : "FEISHU_APP_SECRET"),
    });
    try {
      const result = await client.im.message.create({
        data: {
          content: JSON.stringify({ text: input.renderedContent }),
          msg_type: "text",
          receive_id: input.address,
        },
        params: { receive_id_type: "open_id" },
      });
      const messageId = result.data?.message_id;
      if (!messageId) {
        throw new Error(`Feishu message failed: ${result.code} ${result.msg ?? ""}`);
      }
      return { providerMessageId: messageId };
    } catch (error) {
      throw new InterviewNotificationProviderError({
        cause: error,
        code: "feishu-send-failed",
        kind: "unknown",
        message: error instanceof Error ? error.message : "飞书消息发送失败。",
      });
    }
  }
}
