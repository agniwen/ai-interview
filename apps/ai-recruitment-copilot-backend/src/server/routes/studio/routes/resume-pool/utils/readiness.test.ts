import { describe, expect, it } from "vitest";
import { completeResumePoolReadiness } from "./readiness";
import type { ResumePoolReadinessDeps } from "./readiness";

function createStore() {
  const state = {
    duplicateSnapshotReady: false,
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    error: null as string | null,
    semanticIndexReady: false,
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    status: "processing" as "failed" | "processing" | "ready",
  };
  const deps: ResumePoolReadinessDeps = {
    indexSemanticSource: () => {
      state.semanticIndexReady = true;
      return Promise.resolve();
    },
    markFailed: ({ errorMessage }) => {
      state.error = errorMessage;
      state.status = "failed";
      return Promise.resolve();
    },
    markReady: () => {
      state.error = null;
      state.status = "ready";
      return Promise.resolve();
    },
    replaceDuplicateSnapshot: () => {
      state.duplicateSnapshotReady = true;
      return Promise.resolve();
    },
  };
  return { deps, state };
}

describe("completeResumePoolReadiness", () => {
  it("publishes ready only after semantic vectors and duplicate snapshot exist", async () => {
    const { deps, state } = createStore();

    await completeResumePoolReadiness(
      {
        duplicateMatches: [{ level: "low" }],
        organizationId: "org-1",
        poolItemId: "pool-1",
      },
      deps,
    );

    expect(state).toEqual({
      duplicateSnapshotReady: true,
      error: null,
      semanticIndexReady: true,
      status: "ready",
    });
  });

  it("keeps a failed item retryable and makes the retry ready", async () => {
    const { deps, state } = createStore();
    let firstAttempt = true;
    deps.indexSemanticSource = () => {
      if (firstAttempt) {
        firstAttempt = false;
        return Promise.reject(new Error("qdrant unavailable"));
      }
      state.semanticIndexReady = true;
      return Promise.resolve();
    };

    await expect(
      completeResumePoolReadiness(
        { duplicateMatches: [], organizationId: "org-1", poolItemId: "pool-1" },
        deps,
      ),
    ).rejects.toThrow("qdrant unavailable");
    expect(state.status).toBe("failed");

    await completeResumePoolReadiness(
      { duplicateMatches: [], organizationId: "org-1", poolItemId: "pool-1" },
      deps,
    );
    expect(state.status).toBe("ready");
    expect(state.semanticIndexReady).toBe(true);
  });
});
