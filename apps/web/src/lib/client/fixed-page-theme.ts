export function isHumanInterviewPage(pathname: string): boolean {
  return pathname.startsWith("/human-interview/");
}

export function resolveForcedPageTheme(pathname: string): "dark" | undefined {
  return isHumanInterviewPage(pathname) ? "dark" : undefined;
}
