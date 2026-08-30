import { z } from "zod";

export const DEFAULT_WORKSPACE_MANAGEMENT_TAB = "members";

const WORKSPACE_MANAGEMENT_TABS = ["members", "groups"] as const;
const workspaceManagementTabSchema = z.enum(WORKSPACE_MANAGEMENT_TABS);

export type WorkspaceManagementTab = (typeof WORKSPACE_MANAGEMENT_TABS)[number];
type WorkspaceManagementTabInput = string | null | undefined;

export interface WorkspaceManagementSearch {
  tab?: WorkspaceManagementTab;
}

interface WorkspaceManagementSearchInput {
  tab?: unknown;
}

export function parseWorkspaceManagementTab(
  value: WorkspaceManagementTabInput,
): WorkspaceManagementTab {
  return value === "groups" ? "groups" : DEFAULT_WORKSPACE_MANAGEMENT_TAB;
}

export function coerceWorkspaceManagementSearch(
  search: WorkspaceManagementSearchInput,
): WorkspaceManagementSearch {
  const result = workspaceManagementTabSchema.safeParse(search.tab);
  const tab = result.success ? result.data : DEFAULT_WORKSPACE_MANAGEMENT_TAB;
  return tab === DEFAULT_WORKSPACE_MANAGEMENT_TAB ? {} : { tab };
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
