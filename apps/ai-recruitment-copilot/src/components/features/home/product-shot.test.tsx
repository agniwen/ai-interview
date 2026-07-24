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
  it("renders the homepage mock frame visibly before scrolling", () => {
    const markup = renderToStaticMarkup(<ProductShot />);

    expect(markup).toContain('data-testid="home-product-mock-frame"');
    expect(markup).not.toContain("opacity:0");
  });
});
