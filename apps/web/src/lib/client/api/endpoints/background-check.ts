import type {
  BackgroundCheckCollectionRecord,
  BackgroundCheckEmailPreviewRecord,
} from "@app/shared/studio-pipeline-stages";
import { backgroundCheckRpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

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
  input: { content: string; subject: string; to: string },
): Promise<{ providerMessageId: string; sentAt: string; url: string }> {
  return rpcFetch(
    backgroundCheckRpc(slug, candidateId).email.$post({ json: input }),
    "发送背调信息采集邮件失败",
  );
}
