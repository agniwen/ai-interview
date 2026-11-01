import type { OfferEmailPreviewRecord } from "@app/shared/studio-pipeline-stages";
import { apiFetch } from "@/lib/client/api/client";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function getOfferEmailPreview(
  slug: string,
  candidateId: string,
  draftId: string,
): Promise<OfferEmailPreviewRecord> {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"][":draftId"]["email-preview"].$get({
      param: { draftId, id: candidateId, slug },
    }),
    "加载 Offer 邮件内容失败",
  );
}

export function sendOfferEmail(
  slug: string,
  candidateId: string,
  draftId: string,
  input: { attachments?: readonly File[]; content: string; subject: string; to: string },
): Promise<{ interviewRecordId: string; providerMessageId: string; sentAt: string; url: string }> {
  const formData = new FormData();
  formData.append("content", input.content);
  formData.append("subject", input.subject);
  formData.append("to", input.to);
  for (const file of input.attachments ?? []) {
    formData.append("attachments", file);
  }
  return apiFetch(
    `/api/w/${encodeURIComponent(slug)}/studio/interviews/${encodeURIComponent(candidateId)}/offer-drafts/${encodeURIComponent(draftId)}/email`,
    { body: formData, method: "POST" },
  );
}
