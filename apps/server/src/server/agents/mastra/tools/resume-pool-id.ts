/** Normalize @-mention ids like `pool:uuid` to the bare pool item uuid. */
export function normalizeResumePoolItemId(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("pool:") ? trimmed.slice("pool:".length) : trimmed;
}
