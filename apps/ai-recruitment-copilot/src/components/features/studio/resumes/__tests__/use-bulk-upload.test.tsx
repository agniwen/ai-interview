// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BulkResumeBatchDetailDto,
  BulkResumeBatchDto,
  BulkResumeBatchItemDto,
} from "@arc/shared/bulk-resume-upload";
import { useBulkUploadWithDependencies } from "../use-bulk-upload";
import type { BulkUploadDependencies } from "../use-bulk-upload";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = {
  cancelBulkResumeBatch: vi.fn(),
  createBulkResumeBatch: vi.fn(),
  getBulkResumeBatchDetail: vi.fn(),
  resumeBulkResumeBatch: vi.fn(),
  uploadResumeForBulk: vi.fn(),
};

const bulkUploadDependencies: BulkUploadDependencies = {
  ...apiMocks,
  slug: "acme",
};

const batch: BulkResumeBatchDto = {
  completedAt: null,
  createdAt: "2026-06-06T00:00:00.000Z",
  dedupPolicy: "skip",
  failedCount: 0,
  id: "batch_1",
  jdMode: "bind",
  jobDescriptionId: "jd_1",
  processedCount: 0,
  skippedCount: 0,
  status: "running",
  succeededCount: 0,
  totalCount: 1,
  updatedAt: "2026-06-06T00:00:00.000Z",
};

const item: BulkResumeBatchItemDto = {
  batchId: "batch_1",
  contentHash: "a".repeat(64),
  errorMessage: null,
  fileSize: 1024,
  finishedAt: null,
  id: "item_1",
  orderIndex: 0,
  originalFileName: "resume.pdf",
  resumeRecordId: null,
  startedAt: null,
  status: "pending",
};

function renderHookHarness({
  mode = "resume",
  onBatchQueued,
  onRecordsChanged,
}: {
  mode?: "resume" | "start";
  onBatchQueued?: (detail: BulkResumeBatchDetailDto) => void;
  onRecordsChanged: () => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness() {
    const bulk = useBulkUploadWithDependencies({
      dependencies: bulkUploadDependencies,
      onBatchQueued,
      onRecordsChanged,
    });
    const startedRef = useRef(false);
    useEffect(() => {
      if (startedRef.current) {
        return;
      }
      startedRef.current = true;
      if (mode === "resume") {
        void bulk.resume("batch_1");
      } else {
        void bulk.start([new File(["resume"], "resume.pdf", { type: "application/pdf" })], {
          dedupPolicy: "create",
          jdMode: "auto",
          jobDescriptionId: null,
        });
      }
    }, [bulk]);
    return null;
  }

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  return { container, root };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useBulkUpload", () => {
  it("notifies the page to refresh RSC metrics when processing completes", async () => {
    vi.useFakeTimers();
    const onRecordsChanged = vi.fn();
    const detail: BulkResumeBatchDetailDto = { batch, items: [item] };
    apiMocks.resumeBulkResumeBatch.mockResolvedValue(detail);
    apiMocks.getBulkResumeBatchDetail.mockResolvedValue({
      batch: {
        ...batch,
        completedAt: "2026-06-06T00:00:01.000Z",
        processedCount: 1,
        status: "completed",
      },
      items: [{ ...item, resumeRecordId: "ri_1", status: "succeeded" }],
    });

    const { root } = renderHookHarness({ onRecordsChanged });
    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onRecordsChanged).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("notifies when uploads have been queued for async parsing", async () => {
    vi.useFakeTimers();
    const onBatchQueued = vi.fn();
    const detail: BulkResumeBatchDetailDto = { batch, items: [item] };
    apiMocks.uploadResumeForBulk.mockResolvedValue({
      contentHash: item.contentHash,
      fileSize: item.fileSize,
      originalFileName: item.originalFileName,
      storageKey: "storage/resume.pdf",
    });
    apiMocks.createBulkResumeBatch.mockResolvedValue(detail);

    const { root } = renderHookHarness({
      mode: "start",
      onBatchQueued,
      onRecordsChanged: vi.fn(),
    });
    await flushPromises();

    expect(onBatchQueued).toHaveBeenCalledWith(detail);

    act(() => {
      root.unmount();
    });
  });

  it("stops polling after the page unmounts", async () => {
    vi.useFakeTimers();
    const runningDetail: BulkResumeBatchDetailDto = { batch, items: [item] };
    apiMocks.resumeBulkResumeBatch.mockResolvedValue(runningDetail);
    apiMocks.getBulkResumeBatchDetail.mockResolvedValue(runningDetail);

    const { root } = renderHookHarness({ onRecordsChanged: vi.fn() });
    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(apiMocks.getBulkResumeBatchDetail).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(apiMocks.getBulkResumeBatchDetail).toHaveBeenCalledTimes(1);
  });
});
