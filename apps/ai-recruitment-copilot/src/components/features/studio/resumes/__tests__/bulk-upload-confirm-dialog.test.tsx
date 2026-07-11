// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkUploadConfirmDialog } from "../bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "../bulk-upload-confirm-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/features/studio/interviews/job-description-select-field", () => ({
  JobDescriptionSelectField: () => <div data-testid="job-description-select" />,
}));

function renderDialog(onConfirmed: (files: File[], config: BulkUploadConfirmConfig) => void) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const files = [new File(["resume"], "resume.pdf", { type: "application/pdf" })];

  act(() => {
    root.render(
      <BulkUploadConfirmDialog
        files={files}
        onConfirmed={onConfirmed}
        onOpenChange={vi.fn()}
        onRemoveFile={vi.fn()}
        open={true}
      />,
    );
  });

  return { root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("BulkUploadConfirmDialog", () => {
  it("defaults to auto JD matching and marks suspected duplicates", () => {
    const onConfirmed = vi.fn();
    const { root } = renderDialog(onConfirmed);
    const startButton = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("开始上传"),
    );

    expect(startButton).toBeTruthy();
    act(() => {
      startButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onConfirmed).toHaveBeenCalledWith(expect.any(Array), {
      dedupPolicy: "skip",
      jdMode: "auto",
      jobDescriptionId: null,
    });

    act(() => {
      root.unmount();
    });
  });
});
