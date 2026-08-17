// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkResumeBatchDto } from "@arc/shared/bulk-resume-upload";
import { UploadBatchListDialog } from "../upload-batch-list-dialog";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SAFETY: The jsdom fixture provides the media-query API consumed by use-mobile.
window.matchMedia = ((query: string) => ({
  addEventListener: () => {},
  addListener: () => {},
  dispatchEvent: () => false,
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: () => {},
  removeListener: () => {},
})) as typeof window.matchMedia;

const activeBatch: BulkResumeBatchDto = {
  completedAt: null,
  createdAt: "2026-06-10T08:00:00.000Z",
  dedupPolicy: "create",
  failedCount: 0,
  id: "batch_1",
  jdMode: "auto",
  jobDescriptionId: null,
  processedCount: 1,
  skippedCount: 0,
  status: "running",
  succeededCount: 1,
  totalCount: 3,
  updatedAt: "2026-06-10T08:00:01.000Z",
};

function renderDialog({
  onOpenBatch = vi.fn(),
  onOpenChange = vi.fn(),
}: {
  onOpenBatch?: (batch: BulkResumeBatchDto) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <UploadBatchListDialog
        batches={[activeBatch]}
        onOpenBatch={onOpenBatch}
        onOpenChange={onOpenChange}
        open={true}
      />,
    );
  });

  return { onOpenBatch, onOpenChange, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("UploadBatchListDialog", () => {
  it("keeps the batch list open when opening a batch detail", () => {
    const { onOpenBatch, onOpenChange, root } = renderDialog({});
    const openButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("查看进度"),
    );

    expect(openButton).toBeTruthy();
    act(() => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenBatch).toHaveBeenCalledWith(activeBatch);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    act(() => {
      root.unmount();
    });
  });
});
