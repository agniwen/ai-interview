import type { Database } from "@app/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResumeSemanticProcessing } from "./semantic";

function databaseWithIndexState(profileHash: string): Database {
  const query = {
    from: () => query,
    leftJoin: () => query,
    limit: async () => {
      await Promise.resolve();
      return [{ profileHash, status: "indexed" }];
    },
    where: () => query,
  };
  // SAFETY: The focused index-state callbacks under test use only select/from/
  // leftJoin/where/limit, all of which this fixture implements.
  const database = Object.create(null) as Database;
  Object.defineProperty(database, "select", {
    value: vi.fn(() => query),
  });
  return database;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resume semantic database scope", () => {
  it("keeps returned resume indexer dependencies bound across concurrent runtimes", async () => {
    vi.stubEnv("QDRANT_URL", "http://127.0.0.1:6333");
    const first = createResumeSemanticProcessing(
      databaseWithIndexState("first-resume"),
    ).createDefaultIndexerDeps();
    const second = createResumeSemanticProcessing(
      databaseWithIndexState("second-resume"),
    ).createDefaultIndexerDeps();

    const [firstState, secondState] = await Promise.all([
      first.readIndexState({
        embeddingVersion: "v1",
        profileHash: "input",
        sourceId: "resume-1",
        sourceType: "studio_interview",
      }),
      second.readIndexState({
        embeddingVersion: "v1",
        profileHash: "input",
        sourceId: "resume-2",
        sourceType: "resume_pool_item",
      }),
    ]);

    expect(firstState?.profileHash).toBe("first-resume");
    expect(secondState?.profileHash).toBe("second-resume");
  });

  it("keeps returned job-description indexer dependencies bound across concurrent runtimes", async () => {
    vi.stubEnv("QDRANT_URL", "http://127.0.0.1:6333");
    const first = createResumeSemanticProcessing(
      databaseWithIndexState("first-jd"),
    ).createDefaultJdIndexerDeps();
    const second = createResumeSemanticProcessing(
      databaseWithIndexState("second-jd"),
    ).createDefaultJdIndexerDeps();

    const [firstState, secondState] = await Promise.all([
      first.readIndexState({
        embeddingVersion: "v1",
        profileHash: "input",
        sourceId: "jd-1",
        sourceType: "job_description",
      }),
      second.readIndexState({
        embeddingVersion: "v1",
        profileHash: "input",
        sourceId: "jd-2",
        sourceType: "job_description",
      }),
    ]);

    expect(firstState?.profileHash).toBe("first-jd");
    expect(secondState?.profileHash).toBe("second-jd");
  });
});
