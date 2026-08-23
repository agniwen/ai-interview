// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { BackgroundLayersView } from "./background-layers";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BackgroundLayers", () => {
  it("keeps the shared background fade-free by default", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BackgroundLayersView />);
      await Promise.resolve();
    });

    const artwork = container.querySelector<HTMLElement>('[data-slot="home-hero-artwork"]');
    const artworkFrame = artwork?.parentElement;
    expect(artwork?.className).toContain("mixed-media-k-talent-city-4k-light.jpg");
    expect(artwork?.className).toContain("mixed-media-k-talent-city-4k-dark.jpg");
    expect(artwork?.className).toContain("bg-cover");
    expect(artworkFrame?.className).toContain("h-screen");
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector('[data-slot="home-hero-copy-veil"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="home-hero-artwork-fade"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("adds the short background transition only when explicitly enabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BackgroundLayersView fadeToBackground />);
      await Promise.resolve();
    });

    const fade = container.querySelector<HTMLElement>('[data-slot="home-hero-artwork-fade"]');
    expect(fade?.className).toContain("transparent_88%");
    expect(fade?.className).toContain("var(--background)_100%");

    act(() => root.unmount());
    container.remove();
  });
});
