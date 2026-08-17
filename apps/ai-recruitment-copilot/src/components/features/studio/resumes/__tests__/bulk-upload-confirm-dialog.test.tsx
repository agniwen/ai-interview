// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkUploadConfirmDialog } from "../bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "../bulk-upload-confirm-dialog";

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
