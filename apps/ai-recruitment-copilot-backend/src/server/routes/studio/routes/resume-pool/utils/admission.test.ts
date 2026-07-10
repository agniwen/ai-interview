import { describe, expect, it } from "vitest";
import { admitResumePoolItem } from "./admission";
import type { ResumePoolAdmissionDeps } from "./admission";

interface Source {
  id: string;
  organizationId: string;
  resumeParseStatus: string;
}

function createStore() {
  const records = new Map<string, { error: string | null; status: string }>();
  const deps: ResumePoolAdmissionDeps<Source, { id: string }> = {
    cloneSemanticIndex: () => Promise.resolve(),
    ensureAdmissionRecord: ({ source }) => {
      const id = `record-for-${source.id}`;
      if (!records.has(id)) {
        records.set(id, { error: null, status: "processing" });
      }
      return Promise.resolve(id);
    },
    findDuplicateMatches: () => Promise.resolve([]),
    loadExistingAdmissionRecord: () => Promise.resolve(records.keys().next().value ?? null),
    loadSource: () =>
      Promise.resolve({
        id: "pool-1",
        organizationId: "source-org",
        resumeParseStatus: "ready",
      }),
    markAdmissionFailed: ({ errorMessage, resumeRecordId }) => {
      records.set(resumeRecordId, { error: errorMessage, status: "failed" });
      return Promise.resolve();
    },
    markAdmissionReady: ({ resumeRecordId }) => {
      records.set(resumeRecordId, { error: null, status: "ready" });
      return Promise.resolve();
    },
    replaceDuplicateSnapshot: () => Promise.resolve(),
  };
  return { deps, records };
}

describe("admitResumePoolItem", () => {
  it("marks the stable Resume Record ready only after vectors and duplicate snapshot succeed", async () => {
    const { deps, records } = createStore();

    const result = await admitResumePoolItem(
      {
        dedupPolicy: "force",
        importedBy: "user-1",
        jobDescriptionId: "jd-1",
        organizationId: "target-org",
        poolItemId: "pool-1",
      },
      deps,
    );

    expect(result).toEqual({ resumeRecordId: "record-for-pool-1", status: "imported" });
    if (result.status !== "imported") {
      throw new Error("expected imported result");
    }
    expect(records.get(result.resumeRecordId)).toEqual({ error: null, status: "ready" });
  });

  it("keeps a failed admission retryable and reuses the same Resume Record", async () => {
    const { deps, records } = createStore();
    let firstAttempt = true;
    deps.cloneSemanticIndex = () => {
      if (firstAttempt) {
        firstAttempt = false;
        return Promise.reject(new Error("qdrant unavailable"));
      }
      return Promise.resolve();
    };

    await expect(
      admitResumePoolItem(
        {
          dedupPolicy: "force",
          importedBy: "user-1",
          jobDescriptionId: null,
          organizationId: "target-org",
          poolItemId: "pool-1",
        },
        deps,
      ),
    ).rejects.toThrow("qdrant unavailable");
    expect(records.get("record-for-pool-1")?.status).toBe("failed");

    const retried = await admitResumePoolItem(
      {
        dedupPolicy: "force",
        importedBy: "user-1",
        jobDescriptionId: null,
        organizationId: "target-org",
        poolItemId: "pool-1",
      },
      deps,
    );
    if (retried.status !== "imported") {
      throw new Error("expected imported result");
    }
    expect(retried.resumeRecordId).toBe("record-for-pool-1");
    expect(records.size).toBe(1);
    expect(records.get(retried.resumeRecordId)?.status).toBe("ready");
  });

  it("excludes its stable Resume Record when retrying check-mode admission", async () => {
    const { deps, records } = createStore();
    let firstSnapshot = true;
    let retriedWithExistingRecordId: string | null = null;
    deps.findDuplicateMatches = ({ existingResumeRecordId }) => {
      retriedWithExistingRecordId = existingResumeRecordId;
      if (existingResumeRecordId || records.size === 0) {
        return Promise.resolve([]);
      }
      return Promise.resolve([{ id: "record-for-pool-1" }]);
    };
    deps.replaceDuplicateSnapshot = () => {
      if (firstSnapshot) {
        firstSnapshot = false;
        return Promise.reject(new Error("snapshot unavailable"));
      }
      return Promise.resolve();
    };

    const input = {
      dedupPolicy: "check" as const,
      importedBy: "user-1",
      jobDescriptionId: null,
      organizationId: "target-org",
      poolItemId: "pool-1",
    };
    await expect(admitResumePoolItem(input, deps)).rejects.toThrow("snapshot unavailable");

    await expect(admitResumePoolItem(input, deps)).resolves.toEqual({
      resumeRecordId: "record-for-pool-1",
      status: "imported",
    });
    expect(retriedWithExistingRecordId).toBe("record-for-pool-1");
  });
});
