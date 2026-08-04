import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FeatureBlocks } from "./feature-blocks";

vi.mock("@gsap/react", () => ({
  useGSAP: () => {},
}));

vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: () => {},
  },
}));

vi.mock("gsap/ScrollSmoother", () => ({
  ScrollSmoother: {},
}));

vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {},
}));

vi.mock("@/components/features/home/screens", () => ({
  ChatScreen: () => <div>Chat screen</div>,
  InterviewScreen: () => <div>Interview screen</div>,
  JobsScreen: () => <div>Jobs screen</div>,
}));

describe("FeatureBlocks", () => {
  it("hides later desktop scenes in the static HTML before GSAP initializes", () => {
    const markup = renderToStaticMarkup(<FeatureBlocks />);

    expect(markup).toContain('data-home-scene="0"');
    expect(markup).toContain('data-home-scene="1" style="opacity:0;visibility:hidden"');
    expect(markup).toContain('data-home-scene="2" style="opacity:0;visibility:hidden"');
  });
});
