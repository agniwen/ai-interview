export function isResumeParseCacheEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.RESUME_PARSE_DISABLE_CACHE?.trim().toLowerCase();
  return !(raw === "1" || raw === "true" || raw === "yes");
}
