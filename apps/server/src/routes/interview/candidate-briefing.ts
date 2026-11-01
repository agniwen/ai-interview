export function resolveCandidateCompanyContext({
  currentCompanyContext,
  snapshotCompanyContext,
}: {
  currentCompanyContext: string | null | undefined;
  snapshotCompanyContext: string | null | undefined;
}) {
  return currentCompanyContext?.trim() || snapshotCompanyContext?.trim() || null;
}
