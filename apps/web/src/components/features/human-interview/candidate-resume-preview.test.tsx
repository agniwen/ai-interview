// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CandidateResumePreview } from "./candidate-resume-preview";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("opens on a tap while leaving viewer controls, dragging and multi-pointer gestures alone", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onOpen = vi.fn();
  const onZoom = vi.fn();
  try {
    await act(() =>
      root.render(
        <CandidateResumePreview
          candidate={{ hasResumeFile: true, resumeFileName: "resume.pdf" }}
          onOpen={onOpen}
        >
          <div data-testid="document">简历内容</div>
          <button onClick={onZoom} type="button">
            放大
          </button>
        </CandidateResumePreview>,
      ),
    );
    const documentContent = container.querySelector<HTMLElement>('[data-testid="document"]');
    if (!documentContent) {
      throw new Error("Missing document");
    }
    const pointer = (type: string, pointerId: number, clientY = 0) => {
      const event = new MouseEvent(type, { bubbles: true, clientY });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      act(() => documentContent.dispatchEvent(event));
    };
    await act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(onZoom).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    pointer("pointerdown", 1);
    pointer("pointermove", 1, 60);
    pointer("pointerup", 1, 60);
    await act(() => documentContent.click());
    expect(onOpen).not.toHaveBeenCalled();
    pointer("pointerdown", 1);
    pointer("pointerdown", 2);
    pointer("pointerup", 1);
    pointer("pointerup", 2);
    await act(() => documentContent.click());
    expect(onOpen).not.toHaveBeenCalled();
    pointer("pointerdown", 1);
    pointer("pointerup", 1);
    await act(() => documentContent.click());
    expect(onOpen).toHaveBeenCalledOnce();
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
