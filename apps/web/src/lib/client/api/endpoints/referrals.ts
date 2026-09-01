import {
  createWorkspaceJobDescriptionReferralLink,
  getPublicReferral,
} from "@/lib/client/backend-api";
import type {
  PublicReferralPreview,
  PublicReferralUploadResult,
  ReferralLinkCreateResult,
} from "@arc/shared/referrals";
import { apiFetch } from "../client";

import { apiRequest } from "../rpc-fetch";

export function createJobDescriptionReferralLink(
  slug: string,
  jobDescriptionId: string,
): Promise<ReferralLinkCreateResult> {
  return apiRequest(
    createWorkspaceJobDescriptionReferralLink({
      path: { id: jobDescriptionId, workspaceSlug: slug },
    }),

    "创建内推链接失败",
  );
}

export function fetchPublicReferralPreview(token: string): Promise<PublicReferralPreview> {
  return apiRequest(
    getPublicReferral({ path: { token } }),

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
    `/public/referrals/${encodeURIComponent(token)}/resumes`,
    {
      body: formData,
      method: "POST",
    },
  );
}
