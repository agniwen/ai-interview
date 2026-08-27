export function resolveForcedPageTheme(pathname: string): "dark" | undefined {
  return pathname.startsWith("/human-interview/") ? "dark" : undefined;
}
