export interface ReferralLinkCreateResult {
  url: string;
}

export interface PublicReferralPreview {
  companyName: string;
  jobDescriptionCode: string | null;
  jobDescriptionName: string;
  referrerName: string | null;
}

export interface PublicReferralUploadResult {
  batchId: string;
  poolItemId: string | null;
  status: "queued";
}
