export interface ResumeReviewCardRecord {
  jobDescriptionId?: string | null;
}

export function shouldPresentResumeReviewCard(record?: ResumeReviewCardRecord): boolean {
  return Boolean(record?.jobDescriptionId);
}
