import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { coerceSearchParams } from "./data-grid-search";
import type { SearchParamsRecord } from "./data-grid-search";

export interface InterviewFilters extends Record<string, string> {
  creatorIds: string;
  status: string;
}

export const coerceStudioInterviewsSearch = coerceSearchParams;

export type { SearchParamsRecord } from "./data-grid-search";

export function parseStudioInterviewsQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<InterviewFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["scheduledAt", "createdAt", "candidateName", "roundLabel"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", status: "" },
  });
}
