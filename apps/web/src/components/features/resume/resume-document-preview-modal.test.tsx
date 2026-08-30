// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeDocumentPreviewModal } from "./resume-document-preview-modal";
import type { ResumeDocumentPreviewDialogProps } from "./resume-document-preview-dialog";
import type { ResumeDocumentPreviewModalDependencies } from "./resume-document-preview-modal";

// SAFETY: React 19 reads this documented test-environment flag from the global object.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frameCallbacks: FrameRequestCallback[] = [];
// oxlint-disable-next-line promise/prefer-await-to-callbacks -- requestAnimationFrame is callback-based by contract.
function requestAnimationFrameStub(callback: FrameRequestCallback) {
  frameCallbacks.push(callback);
  return frameCallbacks.length;
}
vi.stubGlobal("requestAnimationFrame", requestAnimationFrameStub);
vi.stubGlobal("cancelAnimationFrame", vi.fn());

function PreviewDialogTestDouble({
  onOpenChange,
  onOpenChangeComplete,
  onReady,
  open,
}: ResumeDocumentPreviewDialogProps) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <div data-open={String(open)} data-testid="preview-dialog">
      <button onClick={() => onOpenChange(false)} type="button">
        关闭
      </button>
      <button onClick={() => onOpenChangeComplete?.(false)} type="button">
        完成关闭动画
      </button>
    </div>
  );
}

const dependencies: ResumeDocumentPreviewModalDependencies = {
  PreviewDialog: PreviewDialogTestDouble,
};

afterEach(() => {
  document.body.innerHTML = "";
  frameCallbacks.length = 0;
  vi.clearAllMocks();
});

describe("ResumeDocumentPreviewModal", () => {
  it("mounts closed before opening and retains the preview through its close animation", async () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ResumeDocumentPreviewModal
          dependencies={dependencies}
          fileName="resume.pdf"
          onClose={onClose}
          url="/resume"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = document.querySelector<HTMLElement>('[data-testid="preview-dialog"]');
    expect(dialog?.dataset.open).toBe("false");

    act(() => frameCallbacks.shift()?.(0));
    expect(dialog?.dataset.open).toBe("true");

    const [closeButton, completeButton] = document.querySelectorAll<HTMLButtonElement>("button");
    act(() => closeButton?.click());
    expect(dialog?.dataset.open).toBe("false");
    expect(onClose).not.toHaveBeenCalled();

    act(() => completeButton?.click());
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
