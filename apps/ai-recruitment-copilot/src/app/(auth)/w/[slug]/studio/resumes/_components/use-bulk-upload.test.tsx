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
import { useBulkUpload } from "./use-bulk-upload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  cancelBulkResumeBatch: vi.fn(),
  createBulkResumeBatch: vi.fn(),
  processNextBulkResumeBatch: vi.fn(),
  resumeBulkResumeBatch: vi.fn(),
  uploadResumeForBulk: vi.fn(),
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "acme",
}));

vi.mock("@/lib/client/api/endpoints/bulk-resume-upload", () => apiMocks);

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

function renderHookHarness(onRecordsChanged: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  function Harness() {
    const bulk = useBulkUpload({ onRecordsChanged });
    const startedRef = useRef(false);
    useEffect(() => {
      if (startedRef.current) {
        return;
      }
      startedRef.current = true;
      void bulk.resume("batch_1");
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
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useBulkUpload", () => {
  it("notifies the page to refresh RSC metrics when processing completes", async () => {
    const onRecordsChanged = vi.fn();
    const detail: BulkResumeBatchDetailDto = { batch, items: [item] };
    apiMocks.resumeBulkResumeBatch.mockResolvedValue(detail);
    apiMocks.processNextBulkResumeBatch.mockResolvedValue({
      batch: { ...batch, completedAt: "2026-06-06T00:00:01.000Z", processedCount: 1 },
      done: true,
      item: { ...item, resumeRecordId: "ri_1", status: "succeeded" },
    });

    const { root } = renderHookHarness(onRecordsChanged);
    await flushPromises();
    await flushPromises();

    expect(onRecordsChanged).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
