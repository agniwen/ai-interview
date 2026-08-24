// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import {
  getResumeLibraryCardHeight,
  useResumeLibraryScrollElement,
} from "../resume-library-page-model";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useResumeLibraryScrollElement", () => {
  it("switches to the studio viewport when OverlayScrollbars identifies it after mount", async () => {
    let animationFrameCallback: FrameRequestCallback | null = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- requestAnimationFrame is callback-based.
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameCallback = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const viewport = document.createElement("div");
    viewport.id = "studio-viewport";
    const listRoot = document.createElement("div");
    viewport.append(listRoot);
    document.body.append(viewport);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const listRootRef = { current: listRoot };

    function Harness() {
      const scrollElement = useResumeLibraryScrollElement(listRootRef);
      return <div data-selected-scroll-element={scrollElement?.id ?? ""} />;
    }

    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      animationFrameCallback?.(0);
    });
    const selectionMarker = container.querySelector<HTMLElement>("[data-selected-scroll-element]");

    expect(selectionMarker?.dataset.selectedScrollElement).toBe("");

    await act(async () => {
      viewport.dataset.scrollRestorationId = STUDIO_MAIN_SCROLL_RESTORATION_ID;
      await Promise.resolve();
    });

    expect(selectionMarker?.dataset.selectedScrollElement).toBe("studio-viewport");

    act(() => root.unmount());
  });
});

describe("getResumeLibraryCardHeight", () => {
  it.each([
    [390, 395],
    [640, 314],
    [768, 334],
    [1024, 297],
    [1280, 219],
    [1536, 217],
  ])("uses the measured median height at %ipx", (viewportWidth, expectedHeight) => {
    expect(getResumeLibraryCardHeight(viewportWidth)).toBe(expectedHeight);
  });
});
