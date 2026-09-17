import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { globalConfig, organization, recruitingOffer } from "@app/db-schema/schema";
import type { OfferEmailInput } from "@app/db-schema/studio-interviews";
import type { OfferEmailPreviewRecord } from "@app/shared/studio-pipeline-stages";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { buildSenderFromAddress, getResendClient } from "../../../../../../lib/server/resend";
import { getGlobalConfig } from "../../global-config/dao";
import { loadDraftById, OfferDraftError } from "./offer-drafts";

function getAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_BASE_URL 未配置");
  }
  return value.replace(/\/$/, "");
}

export function buildOfferPublicUrl(publicPath: string): string {
  return `${getAppUrl()}${publicPath}`;
}

export function composeOfferEmailPreview(input: {
  candidateEmail: string | null;
  candidateName: string;
  companyName: string | null;
  offerPosition: string;
  offerUrl: string;
  organizationName: string;
}): OfferEmailPreviewRecord {
  const companyName = input.companyName?.trim() || input.organizationName;
  return {
    content: `${input.candidateName}，您好：\n\n我们诚挚邀请您加入 ${companyName}，以下是本次 Offer 的确认链接：\n${input.offerUrl}\n\n请在有效期内查看并选择接受或拒绝。`,
    offerUrl: input.offerUrl,
    subject: `【${companyName}】Offer 通知｜${input.offerPosition}`,
    to: input.candidateEmail ?? "",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmailContent(content: string, offerUrl: string) {
  const escapedUrl = escapeHtml(offerUrl);
  return {
    html: escapeHtml(content)
      .replaceAll(escapeHtml(offerUrl), `<a href="${escapedUrl}">${escapedUrl}</a>`)
      .replaceAll("\n", "<br />"),
    text: content,
  };
}

export function hasValidOfferLink(content: string, offerUrl: string): boolean {
  const exactLinkCount = content.split(offerUrl).length - 1;
  const offerPathCount = content.match(/\/offer\/[A-Za-z0-9_-]+/g)?.length ?? 0;
  return exactLinkCount === 1 && offerPathCount === 1;
}

export async function resolveOfferPublicUrl(
  draftId: string,
  organizationId: string,
): Promise<{ interviewRecordId: string; url: string }> {
  const offer = await loadDraftById(draftId, organizationId);
  if (!offer) {
    throw new OfferDraftError("Offer 不存在", 404);
  }
  if (offer.status === "superseded") {
    throw new OfferDraftError("该 Offer 已失效，请创建新的 Offer", 409);
  }
  if (!offer.publicPath || !offer.publishedAt) {
    throw new OfferDraftError("请先确认并发布 Offer", 409);
  }
  return { interviewRecordId: offer.interviewRecordId, url: buildOfferPublicUrl(offer.publicPath) };
}

export async function getOfferEmailPreview(
  draftId: string,
  organizationId: string,
): Promise<OfferEmailPreviewRecord> {
  const offer = await loadDraftById(draftId, organizationId);
  if (!offer?.publicPath || !offer.publishedAt) {
    throw new OfferDraftError(offer ? "请先确认并发布 Offer" : "Offer 不存在", offer ? 409 : 404);
  }
  if (offer.status === "superseded") {
    throw new OfferDraftError("该 Offer 已失效，请创建新的 Offer", 409);
  }
  const [context] = await db
    .select({
      candidateEmail: recruitingRecordReadModel.candidateEmail,
      candidateName: recruitingRecordReadModel.candidateName,
      companyName: globalConfig.companyName,
      organizationName: organization.name,
    })
    .from(recruitingRecordReadModel)
    .innerJoin(organization, eq(organization.id, recruitingRecordReadModel.organizationId))
    .leftJoin(
      globalConfig,
      eq(globalConfig.organizationId, recruitingRecordReadModel.organizationId),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.id, offer.interviewRecordId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!context) {
    throw new OfferDraftError("候选人记录不存在", 404);
  }
  return composeOfferEmailPreview({
    ...context,
    offerPosition: offer.position,
    offerUrl: buildOfferPublicUrl(offer.publicPath),
  });
}

export async function sendOfferEmail(
  draftId: string,
  organizationId: string,
  input: OfferEmailInput,
): Promise<{ interviewRecordId: string; providerMessageId: string; sentAt: string; url: string }> {
  const { interviewRecordId, url } = await resolveOfferPublicUrl(draftId, organizationId);
  const offer = await loadDraftById(draftId, organizationId);
  if (!offer || offer.status !== "sent") {
    throw new OfferDraftError("当前 Offer 已响应，不能继续发送", 409);
  }
  if (!hasValidOfferLink(input.content, url)) {
    throw new OfferDraftError("邮件内容中的 Offer 链接无效，请重新打开弹窗恢复系统链接", 400);
  }
  const config = await getGlobalConfig(organizationId);
  const rendered = renderEmailContent(input.content, url);
  const result = await getResendClient().emails.send({
    from: buildSenderFromAddress(config.companyName),
    html: rendered.html,
    subject: input.subject,
    text: rendered.text,
    to: input.to,
  });
  if (result.error || !result.data) {
    throw new OfferDraftError(
      `邮件发送失败：${result.error?.message ?? "服务未返回邮件编号"}`,
      400,
    );
  }
  const sentAt = new Date();
  await db
    .update(recruitingOffer)
    .set({ emailRecipient: input.to, emailSentAt: sentAt, updatedAt: sentAt })
    .where(eq(recruitingOffer.id, draftId));
  return {
    interviewRecordId,
    providerMessageId: result.data.id,
    sentAt: sentAt.toISOString(),
    url,
  };
}
