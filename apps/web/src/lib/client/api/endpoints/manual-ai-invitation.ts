import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";

export function previewAiInvitation(slug: string, roundId: string) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews["round-emails"][":roundId"]["preview-invitation"].$get({
      param: { roundId, slug },
    }),
    "加载邀请邮件预览失败",
  );
}
export function confirmAiInvitation(slug: string, roundId: string, confirmationToken: string) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews["round-emails"][":roundId"]["confirm-invitation"].$post({
      json: { confirmationToken, confirmed: true },
      param: { roundId, slug },
    }),
    "邀请邮件入队失败",
  );
}
