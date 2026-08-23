// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { BackgroundLayersView } from "./background-layers";
import { DecorativeBackgroundVideo } from "./home-hero-background-video";

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

    const artworks = container.querySelectorAll<HTMLElement>('[data-slot="home-hero-artwork"]');
    const artworkFrame = artworks[0]?.parentElement;
    expect(artworks).toHaveLength(2);
    expect(artworks[0]?.className).toContain("home-hero-artwork-light");
    expect(artworks[0]?.className).toContain("bg-cover");
    expect(artworks[1]?.className).toContain("home-hero-artwork-dark");
    expect(artworks[1]?.className).toContain("dark:block");
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

  it("renders the homepage video as a silent, non-interactive background", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<DecorativeBackgroundVideo active onReady={() => {}} theme="dark" />);
      await Promise.resolve();
    });

    const video = container.querySelector<HTMLVideoElement>(
      '[data-slot="home-hero-background-video"]',
    );
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.controls).toBe(false);
    expect(video?.hasAttribute("disablepictureinpicture")).toBe(true);
    expect(video?.hasAttribute("disableremoteplayback")).toBe(true);
    expect(video?.getAttribute("controlslist")).toContain("noremoteplayback");
    expect(video?.dataset.theme).toBe("dark");
    expect(video?.getAttribute("poster")).toBe(
      "https://ai-interview-1350977987.cos.ap-guangzhou.myqcloud.com/dev/public/homepage/hero/365753858185a99d/home-hero-background-dark-poster.jpg",
    );
    expect(video?.querySelector("source")?.getAttribute("src")).toBe(
      "https://ai-interview-1350977987.cos.ap-guangzhou.myqcloud.com/dev/public/homepage/hero/365753858185a99d/home-hero-background-dark.mp4",
    );
    expect(video?.className).toContain("pointer-events-none");
    expect(video?.tabIndex).toBe(-1);

    act(() => root.unmount());
    container.remove();
  });
});
