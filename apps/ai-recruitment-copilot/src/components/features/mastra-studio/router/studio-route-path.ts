export const MASTRA_STUDIO_ROUTE_BASE = "/platform/mastra-studio";

const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

export function isMastraStudioPath(pathname: string) {
  return (
    pathname === MASTRA_STUDIO_ROUTE_BASE || pathname.startsWith(`${MASTRA_STUDIO_ROUTE_BASE}/`)
  );
}

export function addMastraStudioBase(path: string) {
  if (
    !path ||
    path === "." ||
    path.startsWith("./") ||
    path.startsWith("../") ||
    path.startsWith("?") ||
    path.startsWith("#") ||
    EXTERNAL_URL.test(path) ||
    isMastraStudioPath(path)
  ) {
    return path;
  }

  if (path === "/") {
    return MASTRA_STUDIO_ROUTE_BASE;
  }

  return path.startsWith("/") ? `${MASTRA_STUDIO_ROUTE_BASE}${path}` : path;
}

export function removeMastraStudioBase(pathname: string) {
  if (!isMastraStudioPath(pathname)) {
    return pathname;
  }

  return pathname.slice(MASTRA_STUDIO_ROUTE_BASE.length) || "/";
}
