// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { BackgroundLayersView } from "./background-layers";
import type { MeshGradient } from "@paper-design/shaders-react";
import type { AsciiHeroProps } from "@/components/react-bits/ascii-hero";
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

function AsciiHeroFixture({ color }: AsciiHeroProps) {
  return <div data-color={color} data-testid="ascii-hero" />;
}

function GrainientFixture({ color1, color2, color3 }: ComponentProps<typeof Grainient>) {
  return (
    <div data-color1={color1} data-color2={color2} data-color3={color3} data-testid="grainient" />
  );
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
    expect(mesh?.dataset.colors).toBe("#0f1d45,#002fa7,#5b3cc4,#1d4ed8");
    expect(mesh?.dataset.distortion).toBe("0.8");
    expect(mesh?.dataset.swirl).toBe("0.1");
    expect(mesh?.dataset.grainMixer).toBe("0");
    expect(mesh?.dataset.grainOverlay).toBe("0");
    expect(mesh?.dataset.speed).toBe("0.35");
    expect(container.querySelector<HTMLElement>('[data-testid="ascii-hero"]')?.dataset.color).toBe(
      "rgba(255, 255, 255, 0.32)",
    );
    expect(container.querySelector('[data-testid="dark-veil"]')).toBeNull();
    expect(container.querySelector('[data-testid="dot-grid"]')).toBeNull();
    expect(container.querySelector(".bg-mask")?.className).toContain("dark:opacity-0");

    act(() => root.unmount());
    container.remove();
  });

  it("adds a soft iris hue to the light gradient", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BackgroundLayersView
          components={components}
          mounted
          prefersReducedMotion={false}
          resolvedTheme="light"
        />,
      );
      await Promise.resolve();
    });

    const gradient = container.querySelector<HTMLElement>('[data-testid="grainient"]');
    expect(gradient?.dataset.color1).toBe("#d6e2fa");
    expect(gradient?.dataset.color2).toBe("#1D4ED8");
    expect(gradient?.dataset.color3).toBe("#A78BFA");

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
