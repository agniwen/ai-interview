import type {
  BackgroundCheckCollectionRecord,
  BackgroundCheckEmailPreviewRecord,
} from "@app/shared/studio-pipeline-stages";
import type { BackgroundCheckDraftInput } from "@app/db-schema/background-check";
import { backgroundCheckRpc, rpc } from "@/lib/client/rpc";
import { apiFetch } from "../client";
import { rpcFetch } from "../rpc-fetch";

export function savePublicBackgroundCheckDraft(
  token: string,
  input: BackgroundCheckDraftInput,
): Promise<{ savedAt: string }> {
  return rpcFetch(
    rpc.api.public["background-checks"][":token"].draft.$post({ json: input, param: { token } }),
    "保存背调草稿失败",
  );
}

export function getBackgroundCheckCollection(
  slug: string,
  candidateId: string,
): Promise<BackgroundCheckCollectionRecord | null> {
  return rpcFetch(backgroundCheckRpc(slug, candidateId).index.$get(), "加载背调信息采集状态失败");
}

export function getBackgroundCheckPublicLink(
  slug: string,
  candidateId: string,
): Promise<{ url: string }> {
  return rpcFetch(backgroundCheckRpc(slug, candidateId).link.$post(), "获取背调信息采集链接失败");
}

export function getBackgroundCheckEmailPreview(
  slug: string,
  candidateId: string,
): Promise<BackgroundCheckEmailPreviewRecord> {
  return rpcFetch(
    backgroundCheckRpc(slug, candidateId)["email-preview"].$post(),
    "加载背调邮件内容失败",
  );
}

export function sendBackgroundCheckEmail(
  slug: string,
  candidateId: string,
  input: { attachments?: readonly File[]; content: string; subject: string; to: string },
): Promise<{ providerMessageId: string; sentAt: string; url: string }> {
  if (input.attachments?.length) {
    const formData = new FormData();
    formData.append("content", input.content);
    formData.append("subject", input.subject);
    formData.append("to", input.to);
    for (const file of input.attachments) {
      formData.append("attachments", file);
    }
    return apiFetch(
      `/api/w/${encodeURIComponent(slug)}/studio/interviews/${encodeURIComponent(candidateId)}/background-check/email`,
      { body: formData, method: "POST" },
    );
  }
  return rpcFetch(
    backgroundCheckRpc(slug, candidateId).email.$post({ json: input }),
    "发送背调信息采集邮件失败",
  );
}
