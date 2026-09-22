import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  globalConfig,
  jobDescription,
  organization,
  recruitingBackgroundCheck,
} from "@app/db-schema/schema";
import type {
  BackgroundCheckEmailInput,
  BackgroundCheckDraftInput,
  BackgroundCheckFormInput,
} from "@app/db-schema/background-check";
import { validateEmailAttachments } from "@app/shared/email-attachments";
import type {
  BackgroundCheckCollectionRecord,
  BackgroundCheckEmailPreviewRecord,
} from "@app/shared/studio-pipeline-stages";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { buildEmailAttachments } from "../../../../../../lib/server/email-attachments";
import { buildSenderFromAddress, getResendClient } from "../../../../../../lib/server/resend";
import { getGlobalConfig } from "../../global-config/dao";
import { renderEmailContent } from "./offer-delivery";
import type { Transaction } from "../../../../../interview-notifications/dao";

export class BackgroundCheckError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "BackgroundCheckError";
    this.status = status;
  }
}

function getAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_BASE_URL 未配置");
  }
  return value.replace(/\/$/, "");
}

function serializeBackgroundCheck(
  row: typeof recruitingBackgroundCheck.$inferSelect,
): BackgroundCheckCollectionRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    emailRecipient: row.emailRecipient,
    emailSentAt: row.emailSentAt?.toISOString() ?? null,
    formData: row.formData,
    publicPath: `/background-check/${encodeURIComponent(row.publicToken)}`,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildBackgroundCheckPublicUrl(publicToken: string): string {
  return `${getAppUrl()}/background-check/${encodeURIComponent(publicToken)}`;
}

export function hasValidBackgroundCheckLink(content: string, formUrl: string): boolean {
  const exactLinkCount = content.split(formUrl).length - 1;
  const pathCount = content.match(/\/background-check\/[A-Za-z0-9_-]+/g)?.length ?? 0;
  return exactLinkCount === 1 && pathCount === 1;
}

export function composeBackgroundCheckEmailPreview(input: {
  candidateEmail: string | null;
  candidateName: string;
  companyName: string | null;
  formUrl: string;
  organizationName: string;
}): BackgroundCheckEmailPreviewRecord {
  const companyName = input.companyName?.trim() || input.organizationName;
  return {
    content: `${input.candidateName}，您好：\n\n为推进您加入 ${companyName} 的背景调查，请通过以下链接填写背景调查信息：\n${input.formUrl}\n\n您提交的信息仅用于本次招聘背景调查。`,
    formUrl: input.formUrl,
    subject: `【${companyName}】背景调查信息采集｜${input.candidateName}`,
    to: input.candidateEmail ?? "",
  };
}

export async function getBackgroundCheckCollection(
  recruitingRecordId: string,
  organizationId: string,
): Promise<BackgroundCheckCollectionRecord | null> {
  const [row] = await db
    .select()
    .from(recruitingBackgroundCheck)
    .where(
      and(
        eq(recruitingBackgroundCheck.recruitingRecordId, recruitingRecordId),
        eq(recruitingBackgroundCheck.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? serializeBackgroundCheck(row) : null;
}

export async function ensureBackgroundCheckCollection(
  recruitingRecordId: string,
  organizationId: string,
  createdBy: string | null,
): Promise<{ collection: BackgroundCheckCollectionRecord; created: boolean }> {
  const existing = await getBackgroundCheckCollection(recruitingRecordId, organizationId);
  if (existing) {
    return { collection: existing, created: false };
  }
  const [candidate] = await db
    .select({ pipelineStage: recruitingRecordReadModel.pipelineStage })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!candidate) {
    throw new BackgroundCheckError("候选人记录不存在", 404);
  }
  if (candidate.pipelineStage !== "background_check") {
    throw new BackgroundCheckError("候选人尚未进入背调阶段", 409);
  }
  const [created] = await db
    .insert(recruitingBackgroundCheck)
    .values({
      createdBy,
      organizationId,
      publicToken: crypto.randomUUID(),
      recruitingRecordId,
      status: "pending",
    })
    .onConflictDoNothing({ target: recruitingBackgroundCheck.recruitingRecordId })
    .returning();
  const collection = created
    ? serializeBackgroundCheck(created)
    : await getBackgroundCheckCollection(recruitingRecordId, organizationId);
  if (!collection) {
    throw new BackgroundCheckError("创建背调采集链接失败", 409);
  }
  return { collection, created: Boolean(created) };
}

async function loadEmailContext(recruitingRecordId: string, organizationId: string) {
  const [context] = await db
    .select({
      candidateEmail: recruitingRecordReadModel.candidateEmail,
      candidateName: recruitingRecordReadModel.candidateName,
      companyName: globalConfig.companyName,
      jobName: sql<
        string | null
      >`coalesce(${jobDescription.name}, ${recruitingRecordReadModel.targetRole})`,
      organizationName: organization.name,
    })
    .from(recruitingRecordReadModel)
    .innerJoin(organization, eq(organization.id, recruitingRecordReadModel.organizationId))
    .leftJoin(
      globalConfig,
      eq(globalConfig.organizationId, recruitingRecordReadModel.organizationId),
    )
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.id, recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!context) {
    throw new BackgroundCheckError("候选人记录不存在", 404);
  }
  return context;
}

export async function getBackgroundCheckEmailPreview(
  recruitingRecordId: string,
  organizationId: string,
  createdBy: string | null,
): Promise<{ created: boolean; preview: BackgroundCheckEmailPreviewRecord }> {
  const { collection, created } = await ensureBackgroundCheckCollection(
    recruitingRecordId,
    organizationId,
    createdBy,
  );
  const context = await loadEmailContext(recruitingRecordId, organizationId);
  return {
    created,
    preview: composeBackgroundCheckEmailPreview({
      ...context,
      formUrl: `${getAppUrl()}${collection.publicPath}`,
    }),
  };
}

export async function sendBackgroundCheckEmail(
  recruitingRecordId: string,
  organizationId: string,
  input: BackgroundCheckEmailInput,
  attachments: readonly File[] = [],
): Promise<{ providerMessageId: string; sentAt: string; url: string }> {
  const [collection] = await db
    .select()
    .from(recruitingBackgroundCheck)
    .where(
      and(
        eq(recruitingBackgroundCheck.recruitingRecordId, recruitingRecordId),
        eq(recruitingBackgroundCheck.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!collection) {
    throw new BackgroundCheckError("请先生成背调采集链接", 409);
  }
  if (collection.status === "submitted") {
    throw new BackgroundCheckError("候选人已提交背调信息，不能继续发送", 409);
  }
  const url = buildBackgroundCheckPublicUrl(collection.publicToken);
  if (!hasValidBackgroundCheckLink(input.content, url)) {
    throw new BackgroundCheckError("邮件内容中的背调链接无效，请重新打开弹窗恢复系统链接");
  }
  const attachmentError = validateEmailAttachments(attachments);
  if (attachmentError) {
    throw new BackgroundCheckError(attachmentError);
  }
  const config = await getGlobalConfig(organizationId);
  const rendered = renderEmailContent(input.content, url);
  const result = await getResendClient().emails.send({
    attachments: attachments.length > 0 ? await buildEmailAttachments(attachments) : undefined,
    from: buildSenderFromAddress(config.companyName),
    html: rendered.html,
    subject: input.subject,
    text: rendered.text,
    to: input.to,
  });
  if (result.error || !result.data) {
    throw new BackgroundCheckError(
      `邮件发送失败：${result.error?.message ?? "服务未返回邮件编号"}`,
    );
  }
  const sentAt = new Date();
  await db
    .update(recruitingBackgroundCheck)
    .set({ emailRecipient: input.to, emailSentAt: sentAt, status: "sent", updatedAt: sentAt })
    .where(eq(recruitingBackgroundCheck.recruitingRecordId, recruitingRecordId));
  return { providerMessageId: result.data.id, sentAt: sentAt.toISOString(), url };
}

export async function saveBackgroundCheckDraft(
  publicToken: string,
  draftData: BackgroundCheckDraftInput,
): Promise<{ savedAt: string } | null> {
  const draftSavedAt = new Date();
  const [updated] = await db
    .update(recruitingBackgroundCheck)
    .set({ draftData, draftSavedAt, updatedAt: draftSavedAt })
    .where(
      and(
        eq(recruitingBackgroundCheck.publicToken, publicToken),
        sql`${recruitingBackgroundCheck.status} IN ('pending', 'sent')`,
      ),
    )
    .returning({ savedAt: recruitingBackgroundCheck.draftSavedAt });
  return updated?.savedAt ? { savedAt: updated.savedAt.toISOString() } : null;
}

export function submitBackgroundCheck(
  publicToken: string,
  input: BackgroundCheckFormInput,
  onSubmitted: (context: {
    organizationId: string;
    recruitingRecordId: string;
    submittedAt: Date;
    tx: Transaction;
  }) => Promise<void>,
): Promise<"submitted" | "unavailable"> {
  return db.transaction(async (tx) => {
    const submittedAt = new Date();
    const [updated] = await tx
      .update(recruitingBackgroundCheck)
      .set({
        draftData: null,
        draftSavedAt: null,
        formData: input,
        status: "submitted",
        submittedAt,
        updatedAt: submittedAt,
      })
      .where(
        and(
          eq(recruitingBackgroundCheck.publicToken, publicToken),
          sql`${recruitingBackgroundCheck.status} IN ('pending', 'sent')`,
        ),
      )
      .returning({
        organizationId: recruitingBackgroundCheck.organizationId,
        recruitingRecordId: recruitingBackgroundCheck.recruitingRecordId,
      });
    if (!updated) {
      return "unavailable";
    }
    await onSubmitted({ ...updated, submittedAt, tx });
    return "submitted";
  });
}
