import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductShot } from "./product-shot";

vi.mock("@gsap/react", () => ({
  useGSAP: () => {},
}));

vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: () => {},
  },
}));

vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {},
}));

vi.mock("@/components/features/home/screens", () => ({
  ResumesScreen: () => <div data-testid="home-product-mock-frame" />,
}));

describe("ProductShot", () => {
  it("reveals the homepage mock frame upward as soon as the page mounts", () => {
    const markup = renderToStaticMarkup(<ProductShot />);
    const globalStyles = readFileSync(
      new URL("../../../styles/globals.css", import.meta.url),
      "utf-8",
    );

    expect(markup).toContain('data-testid="home-product-mock-frame"');
    expect(markup).toContain('class="home-product-shot-enter"');
    expect(globalStyles).toContain("@keyframes home-product-shot-enter");
    expect(globalStyles).toContain("transform: translateY(16px)");
    expect(globalStyles).toMatch(
      /\.home-product-shot-enter\s*\{\s*animation:\s*home-product-shot-enter 550ms cubic-bezier\(0\.23, 1, 0\.32, 1\) both;\s*\}/,
    );
    expect(globalStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.home-product-shot-enter\s*\{\s*animation:\s*none !important;\s*\}[\s\S]*\}/,
    );
    expect(markup).not.toContain('style="opacity:0');
  });
});
