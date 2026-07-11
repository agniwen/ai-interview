// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkUploadState } from "../use-bulk-upload";
import { BulkUploadProgressDialog } from "../bulk-upload-progress-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const completedState: BulkUploadState = {
  detail: {
    batch: {
      completedAt: "2026-06-15T08:00:10.000Z",
      createdAt: "2026-06-15T08:00:00.000Z",
      dedupPolicy: "create",
      failedCount: 0,
      id: "batch_1",
      jdMode: "none",
      jobDescriptionId: null,
      processedCount: 1,
      resumePoolScope: null,
      skippedCount: 0,
      status: "completed",
      succeededCount: 1,
      target: "resume_library",
      totalCount: 1,
      updatedAt: "2026-06-15T08:00:10.000Z",
    },
    items: [
      {
        batchId: "batch_1",
        contentHash: "a".repeat(64),
        errorMessage: null,
        fileSize: 1024,
        finishedAt: "2026-06-15T08:00:10.000Z",
        id: "item_1",
        orderIndex: 0,
        originalFileName: "resume.pdf",
        poolItemId: null,
        resumeRecordId: "resume_1",
        startedAt: "2026-06-15T08:00:01.000Z",
        status: "succeeded",
      },
    ],
  },
  phase: "completed",
  uploadError: null,
  uploadFileNames: [],
  uploadStatus: [],
};

function renderDialog({ onAfterClose = vi.fn() }: { onAfterClose?: () => void }) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onOpenChange = vi.fn();

  act(() => {
    root.render(
      <BulkUploadProgressDialog
        onAbort={vi.fn()}
        onAfterClose={onAfterClose}
        onCancel={vi.fn()}
        onOpenChange={onOpenChange}
        onResume={vi.fn()}
        open={true}
        state={completedState}
      />,
    );
  });

  return { onAfterClose, onOpenChange, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("BulkUploadProgressDialog", () => {
  it("notifies parent after closing the batch detail dialog", () => {
    const { onAfterClose, onOpenChange, root } = renderDialog({});
    const closeButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "关闭",
    );

    expect(closeButton).toBeTruthy();
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAfterClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
