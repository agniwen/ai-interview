export const MCP_SCOPES = ["jobs:read", "candidates:read", "reports:read"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export function isMcpEnabled() {
  return (process.env.MCP_ENABLED ?? "true") === "true";
}

export function getMcpResource(baseURL: string) {
  return new URL("/api/mcp", baseURL).href;
}
