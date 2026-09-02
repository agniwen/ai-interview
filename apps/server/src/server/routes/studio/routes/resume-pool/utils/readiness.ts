import type { findSemanticResumeDuplicates } from "@server/lib/server/resume-semantic/dedup-service";

interface ResumePoolReadinessKey {
  organizationId: string;
  poolItemId: string;
}

type DuplicateMatches = Awaited<ReturnType<typeof findSemanticResumeDuplicates>>;

export interface ResumePoolReadinessDeps<TMatch = unknown> {
  indexSemanticSource: (input: ResumePoolReadinessKey) => Promise<void>;
  markFailed: (input: ResumePoolReadinessKey & { errorMessage: string }) => Promise<void>;
  markReady: (input: ResumePoolReadinessKey) => Promise<void>;
  replaceDuplicateSnapshot: (
    input: ResumePoolReadinessKey & { matches: TMatch[] },
  ) => Promise<void>;
}

export async function completeResumePoolReadiness<TMatch>(
  input: ResumePoolReadinessKey & { duplicateMatches: TMatch[] },
  deps: ResumePoolReadinessDeps<TMatch>,
): Promise<void> {
  const key = {
    organizationId: input.organizationId,
    poolItemId: input.poolItemId,
  };
  try {
    await deps.indexSemanticSource(key);
    await deps.replaceDuplicateSnapshot({
      ...key,
      matches: input.duplicateMatches,
    });
    await deps.markReady(key);
  } catch (error) {
    await deps.markFailed({
      ...key,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function completeResumePoolReadinessWithDefaultAdapters(
  input: ResumePoolReadinessKey & { duplicateMatches: DuplicateMatches },
): Promise<void> {
  const [indexer, poolDao, duplicateMatches] = await Promise.all([
    import("@server/lib/server/resume-semantic/indexer"),
    import("../dao"),
    import("@server/lib/server/resume-semantic/duplicate-matches"),
  ]);
  await completeResumePoolReadiness(input, {
    indexSemanticSource: (key) =>
      indexer.runResumeSemanticIndexJob({
        organizationId: key.organizationId,
        sourceId: key.poolItemId,
        sourceType: "resume_pool_item",
      }),
    markFailed: (key) =>
      poolDao.markResumePoolItemParseFailed({
        errorMessage: key.errorMessage,
        organizationId: key.organizationId,
        poolItemId: key.poolItemId,
      }),
    markReady: (key) =>
      poolDao.markResumePoolItemSemanticIndexed({
        organizationId: key.organizationId,
        poolItemId: key.poolItemId,
      }),
    replaceDuplicateSnapshot: async (key) => {
      await duplicateMatches.replaceDuplicateMatchesForSource({
        matches: key.matches,
        organizationId: key.organizationId,
        sourceId: key.poolItemId,
        sourceType: "resume_pool_item",
      });
    },
  });
}
