import type { SearchParamsRecord } from "./data-grid-search";
import { coerceSearchParams, firstSearchValue } from "./data-grid-search";

export const coerceStudioInterviewsSearch = coerceSearchParams;

/** Preserve existing view permissions when joining the two entry points. */
export function resolveInterviewWorkspaceView(
  requested: SearchParamsRecord[string],
  canViewTable: boolean,
  canViewCalendar: boolean,
): "table" | "list" | "calendar" {
  const value = firstSearchValue(requested);
  if (canViewCalendar && (value === "list" || value === "calendar")) {
    return value;
  }
  return canViewTable ? "table" : "list";
}
