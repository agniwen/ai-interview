import type { DedupMatchRecord } from "./endpoints/studio-interviews";
import { isApiError } from "./errors";

/**
 * Extract backend fallback duplicate matches from FormData save endpoints.
 * These endpoints cannot use RPC typing, so callers normalize the 409 payload here.
 */
export function extractResumeDedupConflictMatches(error: unknown): DedupMatchRecord[] | null {
  if (!isApiError(error) || error.status !== 409) {
    return null;
  }

  const { payload } = error;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const { matches, status } = payload as { matches?: unknown; status?: unknown };
  if (status !== "duplicate_found" || !Array.isArray(matches)) {
    return null;
  }

  return matches as DedupMatchRecord[];
}
