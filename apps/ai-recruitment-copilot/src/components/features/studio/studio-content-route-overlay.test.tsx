// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudioContentOverlayProvider,
  StudioContentOverlayTarget,
  StudioContentRouteOverlay,
} from "./studio-content-route-overlay";

// SAFETY: React 19 reads this documented test-environment flag from the global object.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SAFETY: The jsdom fixture implements the MediaQueryList shape used by this component.
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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StudioContentRouteOverlay", () => {
  it("animates the masked detail route into the studio content area", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StudioContentOverlayProvider>
          <StudioContentOverlayTarget />
          <StudioContentRouteOverlay>{() => "简历详情"}</StudioContentRouteOverlay>
        </StudioContentOverlayProvider>,
      );
      await Promise.resolve();
    });

    const overlay = document.querySelector<HTMLElement>('[data-slot="studio-content-overlay"]');
    expect(overlay?.dataset.state).toBe("open");
    expect(overlay?.classList.contains("transition-[opacity,translate,filter]")).toBe(true);
    expect(overlay?.classList.contains("starting:translate-x-(--distance-base)")).toBe(true);
    expect(overlay?.classList.contains("starting:opacity-0")).toBe(true);
    expect(overlay?.classList.contains("starting:blur-(--blur-medium)")).toBe(true);

    act(() => root.unmount());
  });

  it("keeps the detail route mounted until its close transition finishes", async () => {
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StudioContentOverlayProvider>
          <StudioContentOverlayTarget />
          <StudioContentRouteOverlay onClose={onClose}>
            {({ requestClose }) => <button onClick={requestClose}>返回列表</button>}
          </StudioContentRouteOverlay>
        </StudioContentOverlayProvider>,
      );
      await Promise.resolve();
    });

    const overlay = document.querySelector<HTMLElement>('[data-slot="studio-content-overlay"]');
    const closeButton = document.querySelector<HTMLButtonElement>("button");
    act(() => closeButton?.click());

    expect(overlay?.dataset.state).toBe("closing");
    expect(onClose).not.toHaveBeenCalled();

    const transitionEnd = new Event("transitionend", { bubbles: true });
    Object.defineProperty(transitionEnd, "propertyName", { value: "opacity" });
    act(() => overlay?.dispatchEvent(transitionEnd));

    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
