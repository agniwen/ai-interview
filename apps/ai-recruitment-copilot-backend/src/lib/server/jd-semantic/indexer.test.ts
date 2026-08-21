import { describe, expect, it, vi } from "vitest";
import type { JdIndexerDeps } from "./indexer";
import { runJdSemanticIndexJob } from "./indexer";

const job = {
  organizationId: "org-1",
  sourceId: "jd-1",
  sourceType: "job_description" as const,
};
const jd = { departmentName: "算法组", description: "d", id: "jd-1", name: "n", prompt: "p" };
const config = {
  apiKey: "k",
  baseUrl: "b",
  dimensions: 2,
  embeddingVersion: "v1",
  model: "m",
  qdrantApiKey: null,
  qdrantCollectionName: "c",
  qdrantUrl: "u",
};

const baseDeps = (): JdIndexerDeps => ({
  embed: vi.fn(({ chunks }) =>
    Promise.resolve(
      chunks.map((c: { chunkType: string; text: string }) => ({ ...c, embedding: [1, 2] })),
    ),
  ),
  getConfig: () => config,
  loadSource: vi.fn(() => Promise.resolve(jd)),
  markDeleted: vi.fn(() => Promise.resolve()),
  markFailed: vi.fn(() => Promise.resolve()),
  markIndexed: vi.fn(() => Promise.resolve()),
  readIndexState: vi.fn(() => Promise.resolve(null)),
  vectorStore: {
    deleteResumeEmbeddings: vi.fn(() => Promise.resolve()),
    ensureCollection: vi.fn(() => Promise.resolve()),
    searchSimilarResumes: vi.fn(() => Promise.resolve([])),
    upsertResumeEmbeddings: vi.fn(() => Promise.resolve()),
  },
});

describe("runJdSemanticIndexJob", () => {
  it("首次索引 → embed + upsert(sourceType=job_description) + markIndexed", async () => {
    const deps = baseDeps();
    await runJdSemanticIndexJob(job, deps);
    expect(deps.vectorStore.upsertResumeEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "jd-1", sourceType: "job_description" }),
    );
    expect(deps.markIndexed).toHaveBeenCalled();
  });

  it("hash 未变且已 indexed → 跳过", async () => {
    const deps = baseDeps();
    // 先算出稳定 hash 再塞进 readIndexState
    const { hashJobDescriptionForSemanticIndex } = await import("./hash");
    deps.readIndexState = vi.fn(() =>
      Promise.resolve({ profileHash: hashJobDescriptionForSemanticIndex(jd), status: "indexed" }),
    );
    await runJdSemanticIndexJob(job, deps);
    expect(deps.vectorStore.upsertResumeEmbeddings).not.toHaveBeenCalled();
    expect(deps.markIndexed).not.toHaveBeenCalled();
  });

  it("source 缺失 → 清除可能残留的向量和状态，不 upsert", async () => {
    const deps = baseDeps();
    deps.loadSource = vi.fn(() => Promise.resolve(null));
    await runJdSemanticIndexJob(job, deps);
    expect(deps.vectorStore.deleteResumeEmbeddings).toHaveBeenCalledWith({
      organizationId: "org-1",
      sourceId: "jd-1",
      sourceType: "job_description",
    });
    expect(deps.markDeleted).toHaveBeenCalledWith({
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
    });
    expect(deps.vectorStore.upsertResumeEmbeddings).not.toHaveBeenCalled();
  });

  it("embedding 期间岗位被删除 → 不允许向量复活", async () => {
    const deps = baseDeps();
    deps.loadSource = vi.fn().mockResolvedValueOnce(jd).mockResolvedValueOnce(null);

    await runJdSemanticIndexJob(job, deps);

    expect(deps.vectorStore.upsertResumeEmbeddings).not.toHaveBeenCalled();
    expect(deps.vectorStore.deleteResumeEmbeddings).toHaveBeenCalledWith({
      organizationId: "org-1",
      sourceId: "jd-1",
      sourceType: "job_description",
    });
    expect(deps.markDeleted).toHaveBeenCalled();
  });

  it("删除墓碑阻止状态写入时 → 回滚刚写入的向量", async () => {
    const deps = baseDeps();
    deps.markIndexed = vi.fn(() => Promise.resolve(false));

    await runJdSemanticIndexJob(job, deps);

    expect(deps.vectorStore.upsertResumeEmbeddings).toHaveBeenCalled();
    expect(deps.vectorStore.deleteResumeEmbeddings).toHaveBeenCalledWith({
      organizationId: "org-1",
      sourceId: "jd-1",
      sourceType: "job_description",
    });
    expect(deps.markDeleted).toHaveBeenCalledWith({
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
    });
  });

  it("embed 抛错 → markFailed 并 rethrow", async () => {
    const deps = baseDeps();
    deps.embed = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(runJdSemanticIndexJob(job, deps)).rejects.toThrow("boom");
    expect(deps.markFailed).toHaveBeenCalled();
  });
});
