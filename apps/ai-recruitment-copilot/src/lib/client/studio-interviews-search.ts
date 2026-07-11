import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";

export interface InterviewFilters extends Record<string, string> {
  creatorIds: string;
  status: string;
}

type SearchParamsPrimitive = boolean | number | string;
export type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

export function coerceStudioInterviewsSearch(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is SearchParamsPrimitive =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

export function parseStudioInterviewsQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<InterviewFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["scheduledAt", "createdAt", "candidateName", "roundLabel"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", status: "" },
  });
}
