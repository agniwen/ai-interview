import { z } from "zod";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";

export const DEFAULT_WORKSPACE_MANAGEMENT_TAB = "members";

const WORKSPACE_MANAGEMENT_TABS = ["members", "groups"] as const;
const workspaceManagementTabSchema = z.enum(WORKSPACE_MANAGEMENT_TABS);

export type WorkspaceManagementTab = (typeof WORKSPACE_MANAGEMENT_TABS)[number];
type WorkspaceManagementTabInput = string | null | undefined;

export type WorkspaceManagementSearch = SearchParamsRecord & {
  tab?: WorkspaceManagementTab;
};

export function parseWorkspaceManagementTab(
  value: WorkspaceManagementTabInput,
): WorkspaceManagementTab {
  return value === "groups" ? "groups" : DEFAULT_WORKSPACE_MANAGEMENT_TAB;
}

export function coerceWorkspaceManagementSearch(
  search: SearchParamsRecord,
): WorkspaceManagementSearch {
  const coerced = coerceSearchParams(search);
  const result = workspaceManagementTabSchema.safeParse(coerced.tab);
  const tab = result.success ? result.data : DEFAULT_WORKSPACE_MANAGEMENT_TAB;
  const { tab: _tab, ...rest } = coerced;
  return tab === DEFAULT_WORKSPACE_MANAGEMENT_TAB ? rest : { ...rest, tab };
}

export function buildWorkspaceManagementSearch(
  previous: WorkspaceManagementSearch,
  tab: WorkspaceManagementTab,
): WorkspaceManagementSearch {
  if (tab === DEFAULT_WORKSPACE_MANAGEMENT_TAB) {
    const { tab: _tab, ...rest } = previous;
    return rest;
  }
  return { ...previous, tab };
}
