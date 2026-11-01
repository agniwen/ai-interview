import { coerceSearchParams } from "@/lib/client/data-grid-search";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";

export type WorkspaceManagementSearch = SearchParamsRecord;

// 工作区管理只剩成员列表；丢弃旧链接里的 `tab`（如已下线的 `tab=groups`），保留分页与排序。
// Workspace management now only lists members; drop legacy `tab` values such as the
// retired `tab=groups` while keeping pagination and sorting.
export function coerceWorkspaceManagementSearch(
  search: SearchParamsRecord,
): WorkspaceManagementSearch {
  const { tab: _tab, ...rest } = coerceSearchParams(search);
  return rest;
}
