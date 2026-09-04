import { z } from "zod";

import type { StudioPersonDetailTab } from "@/components/features/studio/studio-person-detail-panel";

const RESUME_DETAIL_TABS = [
  "overview",
  "ai-analysis",
  "rounds",
  "human-interview",
  "offer",
] as const satisfies readonly StudioPersonDetailTab[];

const resumeDetailPageSearchValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const resumeDetailPageSearchSchema = z.record(
  z.string(),
  z.union([resumeDetailPageSearchValueSchema, z.array(resumeDetailPageSearchValueSchema)]),
);

export type RecruiterResumeDetailSearch = z.infer<typeof resumeDetailPageSearchSchema>;

const resumeDetailTabSchema = z.enum(RESUME_DETAIL_TABS);

function firstSearchValue(value: RecruiterResumeDetailSearch[string]) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveHumanInterviewReviewRoundId(
  search: Partial<RecruiterResumeDetailSearch>,
): string | null {
  const result = z.object({ reviewRoundId: z.uuid() }).safeParse(search);
  return result.success ? result.data.reviewRoundId : null;
}

export function resolveResumeDetailDefaultTab(
  search: RecruiterResumeDetailSearch,
): StudioPersonDetailTab {
  if (resolveHumanInterviewReviewRoundId(search)) {
    return "human-interview";
  }
  const parsedTab = resumeDetailTabSchema.safeParse(firstSearchValue(search.tab));
  return parsedTab.success ? parsedTab.data : "overview";
}

export function listSearchFromDetailSearch(search: RecruiterResumeDetailSearch) {
  const { tab: _tab, reviewRoundId: _reviewRoundId, ...listSearch } = search;
  return listSearch;
}

export function withoutHumanInterviewReviewSearch<T extends Partial<RecruiterResumeDetailSearch>>(
  search: T,
) {
  const { reviewRoundId: _reviewRoundId, ...rest } = search;
  return rest;
}

export function buildResumeDetailTabSearch(
  search: RecruiterResumeDetailSearch,
  tab: StudioPersonDetailTab,
): RecruiterResumeDetailSearch {
  return { ...withoutHumanInterviewReviewSearch(search), tab };
}
