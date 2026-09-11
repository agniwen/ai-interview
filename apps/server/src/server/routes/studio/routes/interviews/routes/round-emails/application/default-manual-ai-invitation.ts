import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { db } from "../../../../../../../../lib/server/db/index";
import { lockAiRound } from "../../../dao/ai-round-lifecycle";
import {
  buildAiInterviewInvitationToken,
  hashAiInterviewInvitationToken,
} from "../../../dao/ai-interview-invitation-access";
import { getGlobalConfig } from "../../../../global-config/dao";
import { renderRoundInviteEmail } from "../utils/templates";
import {
  enqueueInterviewNotificationEvent,
  createInterviewNotificationDelivery,
} from "../../../../../../../interview-notifications/dao";
import type { Transaction } from "../../../../../../../interview-notifications/dao";
import { loadResumeDetail } from "../../../../resumes/dao/resumes";
import type { RecruitingVisibilityScope } from "../../../../../../../access/recruiting-visibility";

export class ManualInvitationError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409 = 409) {
    super(message);
    this.name = "ManualInvitationError";
    this.status = status;
  }
}

const tokenSchema = z.object({
  actorUserId: z.string(),
  expiresAt: z.number(),
  fingerprint: z.string(),
  organizationId: z.string(),
  requestId: z.uuid(),
  roundId: z.string(),
});
interface Actor {
  organizationId: string;
  actorUserId: string;
  roundId: string;
}
function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) {
    throw new Error("BETTER_AUTH_SECRET 未配置");
  }
  return value;
}
function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function signManualInvitationPreview(value: z.infer<typeof tokenSchema>) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${signature(body)}`;
}
export function verifyManualInvitationPreview(token: string, actor: Actor) {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra) {
    throw new ManualInvitationError("确认信息无效，请重新打开确认弹窗。", 400);
  }
  const expected = Buffer.from(signature(body));
  const actual = Buffer.from(mac);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ManualInvitationError("确认信息无效，请重新打开确认弹窗。", 400);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new ManualInvitationError("确认信息无效。", 400);
  }
  const parsed = tokenSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ManualInvitationError("确认信息无效。", 400);
  }
  const value = parsed.data;
  if (
    value.expiresAt < Date.now() ||
    value.actorUserId !== actor.actorUserId ||
    value.organizationId !== actor.organizationId ||
    value.roundId !== actor.roundId
  ) {
    throw new ManualInvitationError("确认信息已失效，请重新打开弹窗后确认发送。");
  }
  return value;
}

type ManualActor = Actor & { visibility: RecruitingVisibilityScope };

async function loadPreview(tx: Transaction, actor: ManualActor) {
  const locked = await lockAiRound(tx, actor.roundId, actor.organizationId);
  if (!locked) {
    throw new ManualInvitationError("面试轮次不存在。", 404);
  }
  if (!(await loadResumeDetail(locked.record.id, actor.organizationId, actor.visibility))) {
    throw new ManualInvitationError("面试轮次不存在或无权查看。", 404);
  }
  const { round } = locked;
  if (
    !locked.isEffective ||
    round.status !== "pending" ||
    ["declined", "expired"].includes(round.candidateInviteStatus) ||
    (round.candidateInviteExpiresAt && round.candidateInviteExpiresAt <= new Date())
  ) {
    throw new ManualInvitationError("当前面试已失效、已开始或已被替代，不能发送邀请。");
  }
  const [record] = await tx
    .select()
    .from(recruitingRecordReadModel)
    .where(eq(recruitingRecordReadModel.id, locked.record.id))
    .limit(1);
  if (!record) {
    throw new ManualInvitationError("候选人不存在。", 404);
  }
  const email = z.email().safeParse(record.candidateEmail?.trim());
  if (!email.success) {
    throw new ManualInvitationError("请先为候选人填写有效邮箱。", 400);
  }
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_BASE_URL 未配置");
  }
  let interviewUrl = `${base}/interview/${record.id}/${round.id}`;
  if (round.candidateInviteExpiresAt) {
    const token = buildAiInterviewInvitationToken({
      exp: round.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: round.id,
    });
    if (hashAiInterviewInvitationToken(token) !== round.candidateInviteTokenHash) {
      throw new ManualInvitationError("邀请链接已变更，请刷新面试信息。");
    }
    interviewUrl = `${base}/ai-interview-invite/${encodeURIComponent(token)}`;
  }
  const config = await getGlobalConfig(actor.organizationId);
  const rendered = await renderRoundInviteEmail({
    candidateName: record.candidateName,
    companyName: config.companyName,
    interviewUrl,
    manualInvitation: { expiresAt: round.candidateInviteExpiresAt, jobName: record.targetRole },
    roundLabel: round.roundLabel,
    scheduledAt: round.scheduledAt,
  });
  const preview = {
    candidateName: record.candidateName,
    recipient: email.data,
    ...rendered,
    companyName: config.companyName,
    interviewUrl,
    invitationVersion: round.invitationVersion,
    recordId: record.id,
  };
  return {
    fingerprint: createHash("sha256").update(JSON.stringify(preview)).digest("hex"),
    preview,
  };
}

export async function previewManualAiInvitation(actor: ManualActor) {
  return await db.transaction(async (tx) => {
    const { preview, fingerprint } = await loadPreview(tx, actor);
    return {
      candidateName: preview.candidateName,
      confirmationToken: signManualInvitationPreview({
        ...actor,
        expiresAt: Date.now() + 10 * 60_000,
        fingerprint,
        requestId: crypto.randomUUID(),
      }),
      html: preview.html,
      recipient: preview.recipient,
      subject: preview.subject,
    };
  });
}

export async function confirmManualAiInvitation(actor: ManualActor, confirmationToken: string) {
  const confirmation = verifyManualInvitationPreview(confirmationToken, actor);
  return await db.transaction(async (tx) => {
    const { preview, fingerprint } = await loadPreview(tx, actor);
    if (fingerprint !== confirmation.fingerprint) {
      throw new ManualInvitationError("邮箱或邮件内容已发生变化，请重新打开弹窗后确认。");
    }
    const manualAiInvitation = {
      confirmedAt: new Date().toISOString(),
      confirmedBy: actor.actorUserId,
      html: preview.html,
      organizationId: actor.organizationId,
      recipient: preview.recipient,
      requestId: confirmation.requestId,
      roundId: actor.roundId,
      subject: preview.subject,
      text: preview.text,
      version: 1 as const,
    };
    const event = await enqueueInterviewNotificationEvent(tx, {
      actorUserId: actor.actorUserId,
      dedupeKey: `manual-ai-invitation:${actor.organizationId}:${actor.roundId}:${confirmation.requestId}`,
      interviewRecordId: preview.recordId,
      organizationId: actor.organizationId,
      payloadSnapshot: {
        candidateName: preview.candidateName,
        companyName: preview.companyName,
        interviewLink: preview.interviewUrl,
        manualAiInvitation,
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
      },
      scheduleEntryId: actor.roundId,
      scopeType: "ai_round",
      type: "ai_interview_invited",
    });
    const delivery = await createInterviewNotificationDelivery(tx, {
      audienceType: "candidate",
      channel: "email",
      eventId: event.id,
      interviewRecordId: preview.recordId,
      organizationId: actor.organizationId,
      providerId: "resend",
      providerRequestKey: `${event.id}:manual-ai-invitation`,
      recipientAddress: preview.recipient,
      recipientDisplayName: preview.candidateName,
      renderedContent: preview.text,
      renderedSubject: preview.subject,
      // 人工邮件使用事件中的确认快照，不引用模板版本表中的记录。
      templateVersionId: null,
      type: "ai_interview_invited",
    });
    return {
      deliveryId: delivery.id,
      eventId: event.id,
      recipient: delivery.recipientAddress,
      recordId: preview.recordId,
      status: delivery.status,
    };
  });
}
