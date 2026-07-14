export const EMBEDDED_MASTRA_API_PREFIX = "/api/platform/mastra";

export function getEmbeddedMastraApiUrl(path: string, origin = window.location.origin): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${EMBEDDED_MASTRA_API_PREFIX}${normalizedPath}`;
}

export function getEmbeddedMastraWebSocketUrl(
  path: string,
  origin = window.location.origin,
): string {
  const url = new URL(getEmbeddedMastraApiUrl(path, origin));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
