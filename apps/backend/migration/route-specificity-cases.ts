/**
 * Real production route pairs which must be exercised through HTTP once their
 * vertical slice and public authentication fixture boundary are available.
 */
export const routeSpecificityCases = [
  {
    parameterizedPath: "/workspaces/:workspaceSlug/setup/departments/:id",
    staticPath: "/workspaces/:workspaceSlug/setup/departments/all",
  },
] as const;
