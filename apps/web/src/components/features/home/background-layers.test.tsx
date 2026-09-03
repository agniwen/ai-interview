// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DecorativeBackgroundVideo } from "./home-hero-background-video";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BackgroundLayers", () => {
  it("keeps the decorative video silent and non-interactive", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<DecorativeBackgroundVideo theme="dark" />);
      await Promise.resolve();
    });

    const video = container.querySelector<HTMLVideoElement>(
      '[data-slot="home-hero-background-video"]',
    );
    expect(video?.autoplay).toBe(true);
    expect(video?.preload).toBe("auto");
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.controls).toBe(false);
    expect(video?.hasAttribute("disablepictureinpicture")).toBe(true);
    expect(video?.hasAttribute("disableremoteplayback")).toBe(true);
    expect(video?.getAttribute("controlslist")).toContain("noremoteplayback");
    expect(video?.dataset.theme).toBe("dark");
    expect(video?.className).toContain("pointer-events-none");
    expect(video?.tabIndex).toBe(-1);

    act(() => root.unmount());
    container.remove();
  });
});
