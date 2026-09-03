// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayScrollbarsBody } from "../overlay-scrollbars-body";

const overlayScrollbarMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  getInstance: vi.fn(),
  initialize: vi.fn(),
}));

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("OverlayScrollbarsBody", () => {
  it("destroys the body OverlayScrollbars instance on unmount", () => {
    overlayScrollbarMocks.getInstance.mockReturnValue({
      destroy: overlayScrollbarMocks.destroy,
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OverlayScrollbarsBody dependencies={overlayScrollbarMocks} />);
    });

    expect(overlayScrollbarMocks.initialize).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });

    expect(overlayScrollbarMocks.destroy).toHaveBeenCalledTimes(1);
  });
});
