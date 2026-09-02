import type {
  PublicReferralPreview,
  PublicReferralUploadResult,
  ReferralLinkCreateResult,
} from "@app/shared/referrals";
import { apiFetch } from "../client";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function createJobDescriptionReferralLink(
  slug: string,
  jobDescriptionId: string,
): Promise<ReferralLinkCreateResult> {
  return rpcFetch(
    rpc.api.w[":slug"].studio["job-descriptions"][":id"]["referral-link"].$post({
      param: { id: jobDescriptionId, slug },
    }),
    "创建内推链接失败",
  );
}

export function fetchPublicReferralPreview(token: string): Promise<PublicReferralPreview> {
  return rpcFetch(
    rpc.api.public.referrals[":token"].$get({
      param: { token },
    }),
    "加载内推信息失败",
  );
}

export function uploadPublicReferralResume(
  token: string,
  file: File,
): Promise<PublicReferralUploadResult> {
  const formData = new FormData();
  formData.append("resume", file);
  return apiFetch<PublicReferralUploadResult>(
    `/api/public/referrals/${encodeURIComponent(token)}/resumes`,
    {
      body: formData,
      method: "POST",
    },
  );
}
