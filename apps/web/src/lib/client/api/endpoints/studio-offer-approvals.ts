import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function getOfferApprovalPolicy(
  slug: string,
  candidateId: string,
): Promise<{ approvalRequired: boolean }> {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"]["approval-policy"].$get({
      param: { id: candidateId, slug },
    }),
    "读取 Offer 审批配置失败",
  );
}

/** 作废有审批历史的未发布草稿，保留审批记录。 */
export function voidOfferDraft(
  slug: string,
  candidateId: string,
  draftId: string,
): Promise<OfferDraftRecord> {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews[":id"]["offer-drafts"][":draftId"].void.$post({
      param: { draftId, id: candidateId, slug },
    }),
    "作废 Offer 草稿失败",
  );
}
