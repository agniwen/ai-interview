export function shouldShowStudioListLoadingState({
  isInitialLoading,
  isRefetching,
  recordCount,
}: {
  isInitialLoading: boolean;
  isRefetching: boolean;
  recordCount: number;
}) {
  return recordCount === 0 && (isInitialLoading || isRefetching);
}
