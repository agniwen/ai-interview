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
  MeshGradient: ({ speed }: { speed: number }) => (
    <div data-speed={speed} data-testid="mesh-gradient" />
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

    expect(
      container.querySelector<HTMLElement>('[data-testid="mesh-gradient"]')?.dataset.speed,
    ).toBe("0.35");
    expect(container.querySelector('[data-testid="ascii-hero"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dark-veil"]')).toBeNull();
    expect(container.querySelector('[data-testid="dot-grid"]')).toBeNull();

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
