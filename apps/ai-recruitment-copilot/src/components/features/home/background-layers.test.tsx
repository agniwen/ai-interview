// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BackgroundLayers } from "./background-layers";

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("@paper-design/shaders-react", () => ({
  MeshGradient: ({
    colors,
    distortion,
    grainMixer,
    grainOverlay,
    speed,
    swirl,
  }: {
    colors: string[];
    distortion: number;
    grainMixer: number;
    grainOverlay: number;
    speed: number;
    swirl: number;
  }) => (
    <div
      data-colors={colors.join(",")}
      data-distortion={distortion}
      data-grain-mixer={grainMixer}
      data-grain-overlay={grainOverlay}
      data-speed={speed}
      data-swirl={swirl}
      data-testid="mesh-gradient"
    />
  ),
}));

vi.mock("motion/react", () => ({
  useReducedMotion: () => mocks.reducedMotion,
}));

vi.mock("@/components/react-bits/ascii-hero", () => ({
  AsciiHero: () => <div data-testid="ascii-hero" />,
}));

vi.mock("@/components/react-bits/dark-veil", () => ({
  DarkVeil: () => <div data-testid="dark-veil" />,
}));

vi.mock("@/components/react-bits/dot-grid", () => ({
  default: () => <div data-testid="dot-grid" />,
}));

vi.mock("@/components/react-bits/grainient", () => ({
  default: () => <div data-testid="grainient" />,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("BackgroundLayers", () => {
  it("uses the mesh gradient with the shared ASCII field in dark mode", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BackgroundLayers />);
      await Promise.resolve();
    });

    const mesh = container.querySelector<HTMLElement>('[data-testid="mesh-gradient"]');
    expect(mesh?.dataset.colors).toBe("#e0eaff,#241d9a,#f75092,#9f50d3");
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
    mocks.reducedMotion = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<BackgroundLayers />);
      await Promise.resolve();
    });

    expect(
      container.querySelector<HTMLElement>('[data-testid="mesh-gradient"]')?.dataset.speed,
    ).toBe("0");

    act(() => root.unmount());
    container.remove();
    mocks.reducedMotion = false;
  });
});
