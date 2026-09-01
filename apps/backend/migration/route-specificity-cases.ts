/**
 * Real production route pairs which must be exercised through HTTP once their
 * vertical slice and public authentication fixture boundary are available.
 */
export const routeSpecificityCases = [
  {
    parameterizedPath: "/api/w/:slug/studio/departments/:id",
    staticPath: "/api/w/:slug/studio/departments/all",
  },
] as const;
