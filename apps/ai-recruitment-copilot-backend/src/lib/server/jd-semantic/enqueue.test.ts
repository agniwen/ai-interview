import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteJobDescriptionSemanticIndexBestEffort,
  enqueueJobDescriptionIndexJobBestEffort,
} from "./enqueue";
import type { JobDescriptionSemanticIndexDependencies } from "./enqueue";

const mocks = {
  createStore: vi.fn(),
  deleteResumeEmbeddings: vi.fn(),
  deleteState: vi.fn(),
  enqueueJobs: vi.fn(),
  getConfig: vi.fn(),
  isEnabled: vi.fn(() => false),
  prepareJob: vi.fn(),
};

const dependencies: JobDescriptionSemanticIndexDependencies = {
  createStore: mocks.createStore,
  deleteState: mocks.deleteState,
  enqueueJobs: mocks.enqueueJobs,
  getConfig: mocks.getConfig,
  isEnabled: mocks.isEnabled,
  prepareJob: mocks.prepareJob,
};

describe("enqueueJobDescriptionIndexJobBestEffort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEnabled.mockReturnValue(false);
  });

  it("功能未启用 → 静默返回不抛", async () => {
    await expect(
      enqueueJobDescriptionIndexJobBestEffort(
        {
          jobDescriptionId: "jd-1",
          organizationId: "org-1",
        },
        dependencies,
      ),
    ).resolves.toBeUndefined();
  });

  it("jobDescriptionId 为空 → 静默返回", async () => {
    await expect(
      enqueueJobDescriptionIndexJobBestEffort(
        { jobDescriptionId: null, organizationId: "org-1" },
        dependencies,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("deleteJobDescriptionSemanticIndexBestEffort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createStore.mockResolvedValue({ deleteResumeEmbeddings: mocks.deleteResumeEmbeddings });
    mocks.deleteState.mockImplementation(() => Promise.resolve());
  });

  it("有 qdrantUrl → 删向量 + 删状态行", async () => {
    mocks.getConfig.mockReturnValue({
      dimensions: 8,
      qdrantApiKey: null,
      qdrantCollectionName: "c",
      qdrantUrl: "http://qdrant.local",
    });
    mocks.deleteResumeEmbeddings.mockImplementation(() => Promise.resolve());
    await expect(
      deleteJobDescriptionSemanticIndexBestEffort(
        {
          jobDescriptionId: "jd-1",
          organizationId: "org-1",
        },
        dependencies,
      ),
    ).resolves.toBeUndefined();

    expect(mocks.deleteResumeEmbeddings).toHaveBeenCalledWith({
      sourceId: "jd-1",
      sourceType: "job_description",
    });
    expect(mocks.deleteState).toHaveBeenCalledTimes(1);
  });

  it("无 qdrantUrl → 直接返回不抛，不删向量也不删状态行", async () => {
    mocks.getConfig.mockReturnValue({
      dimensions: 8,
      qdrantApiKey: null,
      qdrantCollectionName: "c",
      qdrantUrl: "",
    });
    await expect(
      deleteJobDescriptionSemanticIndexBestEffort(
        {
          jobDescriptionId: "jd-1",
          organizationId: "org-1",
        },
        dependencies,
      ),
    ).resolves.toBeUndefined();

    expect(mocks.deleteResumeEmbeddings).not.toHaveBeenCalled();
    expect(mocks.deleteState).not.toHaveBeenCalled();
  });

  it("store 抛错 → 被吞掉，console.warn 记录结构化日志", async () => {
    mocks.getConfig.mockReturnValue({
      dimensions: 8,
      qdrantApiKey: null,
      qdrantCollectionName: "c",
      qdrantUrl: "http://qdrant.local",
    });
    mocks.deleteResumeEmbeddings.mockRejectedValue(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      deleteJobDescriptionSemanticIndexBestEffort(
        {
          jobDescriptionId: "jd-1",
          organizationId: "org-1",
        },
        dependencies,
      ),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      "[jd-semantic-index] delete failed",
      expect.objectContaining({ jobDescriptionId: "jd-1" }),
    );
    warnSpy.mockRestore();
  });
});
