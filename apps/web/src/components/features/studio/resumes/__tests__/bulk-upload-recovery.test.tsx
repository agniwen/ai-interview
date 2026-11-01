// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BulkResumeBatchDetailDto } from "@app/shared/bulk-resume-upload";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/api/errors";
import { useBulkUploadWithDependencies } from "../use-bulk-upload";
import type { BulkUploadDependencies } from "../use-bulk-upload";

// SAFETY: React's test environment flag is supported by the act test API.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
const config = { dedupPolicy: "create", jdMode: "auto", jobDescriptionId: null } as const;
const files = ["bad.pdf", "good.pdf"].map(
  (name) => new File([name], name, { type: "application/pdf" }),
);
const descriptor = (file: File) => ({
  contentHash: file.name,
  fileSize: file.size,
  originalFileName: file.name,
  storageKey: file.name,
});
const detail: BulkResumeBatchDetailDto = {
  batch: {
    ...config,
    completedAt: "2026-10-17T00:00:00.000Z",
    createdAt: "2026-10-17T00:00:00.000Z",
    failedCount: 0,
    id: "batch",
    processedCount: 1,
    skippedCount: 0,
    status: "completed",
    succeededCount: 1,
    totalCount: 1,
    updatedAt: "2026-10-17T00:00:00.000Z",
  },
  items: [],
};
function harness(upload: BulkUploadDependencies["uploadResumeForBulk"]) {
  const createBatch = vi.fn().mockResolvedValue(detail);
  const dependencies: BulkUploadDependencies = {
    cancelBulkResumeBatch: vi.fn(),
    createBulkResumeBatch: createBatch,
    getBulkResumeBatchDetail: vi.fn().mockResolvedValue(detail),
    resumeBulkResumeBatch: vi.fn(),
    slug: "acme",
    uploadResumeForBulk: upload,
  };
  const onBatchQueued = vi.fn();
  let current: ReturnType<typeof useBulkUploadWithDependencies>;
  function Harness({ slug }: { slug: string }) {
    current = useBulkUploadWithDependencies({
      dependencies: { ...dependencies, slug },
      onBatchQueued,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  const queryClient = new QueryClient();
  const render = (slug: string) =>
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness slug={slug} />
        </QueryClientProvider>,
      ),
    );
  render("acme");
  return {
    get bulk() {
      return current;
    },
    cancelBatch: dependencies.cancelBulkResumeBatch,
    createBatch,
    getDetail: dependencies.getBulkResumeBatchDetail,
    onBatchQueued,
    render,
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  vi.useRealTimers();
});

describe("bulk upload recovery", () => {
  it("retains queued successes when every manually retried file still fails", async () => {
    vi.useFakeTimers();
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) =>
      file.name === "bad.pdf"
        ? Promise.reject(new ApiError("Bad gateway", { status: 502 }))
        : Promise.resolve(descriptor(file)),
    );
    const h = harness(upload);
    await act(async () => {
      const run = h.bulk.start(files, config);
      await vi.runAllTimersAsync();
      await run;
    });
    await act(async () => {
      const run = h.bulk.retryFailed();
      await vi.runAllTimersAsync();
      await run;
    });
    expect(h.bulk.state.phase).toBe("partial_failure");
    expect(h.bulk.state.queuedCount).toBe(1);
    expect(h.createBatch).toHaveBeenCalledTimes(1);
  });
  it.each(["view", "resume"] as const)(
    "preserves recoverable files when using %s from history",
    async (action) => {
      const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) =>
        file.name === "bad.pdf"
          ? Promise.reject(new ApiError("Storage unavailable", { status: 500 }))
          : Promise.resolve(descriptor(file)),
      );
      const h = harness(upload);
      await act(async () => {
        await h.bulk.start(files, config);
      });
      await act(async () => {
        await h.bulk[action]("batch");
      });
      expect(h.bulk.state.phase).toBe("partial_failure");
      upload.mockImplementation((_slug, file) => Promise.resolve(descriptor(file)));
      await act(async () => {
        await h.bulk.retryFailed();
      });
      expect(h.createBatch).toHaveBeenCalledTimes(2);
      expect(h.createBatch.mock.calls[1][1].files).toEqual([descriptor(files[0])]);
    },
  );
  it("does not reuse pending files or accept late responses after a workspace switch", async () => {
    const deferred = Promise.withResolvers<ReturnType<typeof descriptor>>();
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>(() => deferred.promise);
    const h = harness(upload);
    let run: Promise<void>;
    act(() => {
      run = h.bulk.start([files[0]], config);
    });
    h.render("other");
    await act(async () => {
      deferred.resolve(descriptor(files[0]));
      await run;
      await h.bulk.retryFailed();
    });
    expect(h.createBatch).not.toHaveBeenCalled();
    expect(h.bulk.state.phase).toBe("idle");
    expect(h.bulk.state.uploadFileNames).toEqual([]);
  });
  it("releases a pending submission on workspace switch and ignores its late receipt", async () => {
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) =>
      Promise.resolve(descriptor(file)),
    );
    const h = harness(upload);
    const deferred = Promise.withResolvers<typeof detail>();
    h.createBatch.mockReturnValueOnce(deferred.promise);
    let run: Promise<void>;
    await act(async () => {
      run = h.bulk.start([files[0]], config);
      await Promise.resolve();
    });
    expect(h.bulk.state.phase).toBe("creating");
    h.render("other");
    await act(async () => {
      await h.bulk.start([files[1]], config);
      deferred.resolve(detail);
      await run;
    });
    expect(h.createBatch.mock.calls.map((call) => call[0])).toEqual(["acme", "other"]);
    expect(h.onBatchQueued).toHaveBeenCalledTimes(1);
    expect(h.bulk.state.uploadFileNames).toEqual(["good.pdf"]);
  });
  it("keeps polling previously queued files after an unsuccessful manual retry", async () => {
    vi.useFakeTimers();
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) =>
      file.name === "bad.pdf"
        ? Promise.reject(new ApiError("Unavailable", { status: 500 }))
        : Promise.resolve(descriptor(file)),
    );
    const h = harness(upload);
    h.createBatch.mockResolvedValue({ ...detail, batch: { ...detail.batch, status: "running" } });
    await act(async () => {
      await h.bulk.start(files, config);
    });
    await act(async () => {
      await h.bulk.retryFailed();
      await vi.runAllTimersAsync();
    });
    expect(h.getDetail).toHaveBeenCalledTimes(1);
    expect(h.bulk.state.detail?.batch.status).toBe("completed");
    expect(h.bulk.state.phase).toBe("partial_failure");
  });
  it("ignores a late batch cancellation receipt after switching workspaces", async () => {
    const h = harness(vi.fn());
    const deferred = Promise.withResolvers<typeof detail>();
    vi.mocked(h.cancelBatch).mockReturnValue(deferred.promise);
    await act(async () => {
      await h.bulk.view("batch");
    });
    let run: Promise<string | null>;
    act(() => {
      run = h.bulk.cancel();
    });
    h.render("other");
    await act(async () => {
      deferred.resolve(detail);
      await run;
    });
    expect(h.bulk.state.phase).toBe("idle");
    expect(h.bulk.state.detail).toBeNull();
  });
  it("queues successful files even when another file is invalid", async () => {
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) => {
      if (file.name === "bad.pdf") {
        return Promise.reject(new ApiError("文件无效", { status: 400 }));
      }
      return Promise.resolve(descriptor(file));
    });
    const h = harness(upload);
    await act(async () => {
      await h.bulk.start(files, config);
    });
    expect(h.createBatch).toHaveBeenCalledTimes(1);
    expect(h.createBatch.mock.calls[0][1].files).toEqual([descriptor(files[1])]);
    expect(h.bulk.state.phase).toBe("partial_failure");
    expect(h.onBatchQueued.mock.calls[0][1]).toEqual({ failedCount: 1 });
  });
  it("bounds retries when all uploads fail and never creates an empty batch", async () => {
    vi.useFakeTimers();
    const upload = vi.fn().mockRejectedValue(new ApiError("服务暂时不可用", { status: 502 }));
    const h = harness(upload);
    await act(async () => {
      const run = h.bulk.start(files, config);
      await vi.runAllTimersAsync();
      await run;
    });
    expect(upload).toHaveBeenCalledTimes(6);
    expect(h.createBatch).not.toHaveBeenCalled();
    expect(h.bulk.state.phase).toBe("upload_failed");
  });
  it("reuses upload identities and only retries failed files manually", async () => {
    vi.useFakeTimers();
    let fail = true;
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) => {
      if (fail && file.name === "bad.pdf") {
        return Promise.reject(new ApiError("服务暂时不可用", { status: 502 }));
      }
      return Promise.resolve(descriptor(file));
    });
    const h = harness(upload);
    await act(async () => {
      const run = h.bulk.start(files, config);
      await vi.runAllTimersAsync();
      await run;
    });
    fail = false;
    await act(async () => {
      await h.bulk.retryFailed();
    });
    expect(upload.mock.calls.filter((call) => call[1].name === "good.pdf")).toHaveLength(1);
    expect(h.createBatch).toHaveBeenCalledTimes(2);
    const failedCalls = upload.mock.calls.filter((call) => call[1].name === "bad.pdf");
    expect(new Set(failedCalls.map((call) => call[2]?.requestId)).size).toBe(1);
    expect(failedCalls[0][2]?.requestId).toBeTruthy();
  });
  it("retries a lost batch response with the same identity without reuploading", async () => {
    vi.useFakeTimers();
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) =>
      Promise.resolve(descriptor(file)),
    );
    const h = harness(upload);
    h.createBatch.mockRejectedValueOnce(new ApiError("网关错误", { status: 502 }));
    await act(async () => {
      const run = h.bulk.start([files[1]], config);
      await vi.runAllTimersAsync();
      await run;
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(h.createBatch).toHaveBeenCalledTimes(2);
    expect(h.createBatch.mock.calls[0][1].requestId).toBeTruthy();
    expect(h.createBatch.mock.calls[0][1]).toEqual(h.createBatch.mock.calls[1][1]);
  });
  it("stops scheduling and ignores late upload responses after cancellation", async () => {
    const deferred = Promise.withResolvers<ReturnType<typeof descriptor>>();
    const upload = vi.fn(() => deferred.promise);
    const h = harness(upload);
    let run: Promise<void>;
    act(() => {
      run = h.bulk.start([files[0]], config);
    });
    await act(async () => {
      await h.bulk.cancel();
      deferred.resolve(descriptor(files[0]));
      await run;
    });
    expect(h.createBatch).not.toHaveBeenCalled();
    expect(h.bulk.state.phase).toBe("cancelled");
  });
  it("stops the upload pool on expired authentication without queuing files", async () => {
    const upload = vi.fn().mockRejectedValue(new ApiError("Unauthorized", { status: 401 }));
    const h = harness(upload);
    await act(async () => {
      await h.bulk.start(
        Array.from({ length: 21 }, () => files[0]),
        config,
      );
    });
    expect(upload).toHaveBeenCalledTimes(4);
    expect(h.createBatch).not.toHaveBeenCalled();
    expect(h.bulk.state.uploadStatus).toEqual(Array.from({ length: 21 }, () => "failed"));
    expect(h.bulk.state.canRetry).toBe(true);
  });
  it("retains an uncertain submission across close and blocks replacement until replay", async () => {
    vi.useFakeTimers();
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>((_slug, file) =>
      Promise.resolve(descriptor(file)),
    );
    const h = harness(upload);
    h.createBatch.mockRejectedValue(new ApiError("Bad gateway", { status: 502 }));
    await act(async () => {
      const run = h.bulk.start([files[1]], config);
      await vi.runAllTimersAsync();
      await run;
    });
    expect(h.bulk.state.phase).toBe("batch_failed");
    act(() => h.bulk.abort());
    await act(async () => {
      await h.bulk.start([files[0]], config);
      await h.bulk.view("other-batch");
    });
    expect(upload).toHaveBeenCalledTimes(1);
    h.createBatch.mockResolvedValue(detail);
    await act(async () => {
      await h.bulk.retryFailed();
    });
    expect(h.createBatch).toHaveBeenCalledTimes(4);
    expect(h.createBatch.mock.calls[3][1]).toEqual(h.createBatch.mock.calls[0][1]);
    expect(h.bulk.state.phase).toBe("completed");
  });
  it("aborts the actual request signal and does not retry during backoff after stop", async () => {
    vi.useFakeTimers();
    const upload = vi.fn<BulkUploadDependencies["uploadResumeForBulk"]>(() =>
      Promise.reject(new ApiError("Bad gateway", { status: 502 })),
    );
    const h = harness(upload);
    let run: Promise<void>;
    await act(async () => {
      run = h.bulk.start([files[0]], config);
      await Promise.resolve();
    });
    await act(async () => {
      await h.bulk.cancel();
      await vi.runAllTimersAsync();
      await run;
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect(h.createBatch).not.toHaveBeenCalled();
  });
});
