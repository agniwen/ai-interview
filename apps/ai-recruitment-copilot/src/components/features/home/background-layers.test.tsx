// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { BackgroundLayersView } from "./background-layers";
import type { MeshGradient } from "@paper-design/shaders-react";
import type Grainient from "@/components/react-bits/grainient";

function MeshGradientFixture({
  colors,
  distortion,
  grainMixer,
  grainOverlay,
  speed,
  swirl,
}: ComponentProps<typeof MeshGradient>) {
  return (
    <div
      data-colors={colors?.join(",") ?? ""}
      data-distortion={distortion}
      data-grain-mixer={grainMixer}
      data-grain-overlay={grainOverlay}
      data-speed={speed}
      data-swirl={swirl}
      data-testid="mesh-gradient"
    />
  );
}

function AsciiHeroFixture() {
  return <div data-testid="ascii-hero" />;
}

function GrainientFixture(_props: ComponentProps<typeof Grainient>) {
  return <div data-testid="grainient" />;
}

const components = {
  AsciiHero: AsciiHeroFixture,
  Grainient: GrainientFixture,
  MeshGradient: MeshGradientFixture,
};

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BackgroundLayers", () => {
  it("uses the mesh gradient with the shared ASCII field in dark mode", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BackgroundLayersView
          components={components}
          mounted
          prefersReducedMotion={false}
          resolvedTheme="dark"
        />,
      );
      await Promise.resolve();
    });

    const mesh = container.querySelector<HTMLElement>('[data-testid="mesh-gradient"]');
    expect(mesh?.dataset.colors).toBe("#e3ebff,#1d4ed8,#3e68df,#7699ef");
    expect(mesh?.dataset.distortion).toBe("0.8");
    expect(mesh?.dataset.swirl).toBe("0.1");
    expect(mesh?.dataset.grainMixer).toBe("0");
    expect(mesh?.dataset.grainOverlay).toBe("0");
    expect(mesh?.dataset.speed).toBe("0.35");
    expect(container.querySelector('[data-testid="ascii-hero"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dark-veil"]')).toBeNull();
    expect(container.querySelector('[data-testid="dot-grid"]')).toBeNull();
    expect(container.querySelector(".bg-mask")?.className).toContain("dark:opacity-0");

    act(() => root.unmount());
    container.remove();
  });

  it("stops the mesh animation when reduced motion is preferred", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BackgroundLayersView
          components={components}
          mounted
          prefersReducedMotion
          resolvedTheme="dark"
        />,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector<HTMLElement>('[data-testid="mesh-gradient"]')?.dataset.speed,
    ).toBe("0");

    act(() => root.unmount());
    container.remove();
  });
});
