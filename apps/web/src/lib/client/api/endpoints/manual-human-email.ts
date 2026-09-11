import type { ManualHumanEmailType } from "@app/shared/manual-human-email";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";

export function previewHumanEmail(slug: string, meetingId: string, roundId: string) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews["round-emails"].human[":meetingId"][
      ":roundId"
    ].preview.$get({ param: { meetingId, roundId, slug } }),
    "加载邮件通知信息失败",
  );
}

export function confirmHumanEmail(
  slug: string,
  meetingId: string,
  roundId: string,
  type: ManualHumanEmailType,
  confirmationToken: string,
) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews["round-emails"].human[":meetingId"][
      ":roundId"
    ].confirm.$post({
      json: { confirmationToken, confirmed: true, type },
      param: { meetingId, roundId, slug },
    }),
    "提交邮件通知失败",
  );
}
