import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QualitativeRecommendationBadge } from "../qualitative-resume-evaluation-panel";

describe("QualitativeRecommendationBadge", () => {
  it.each([
    ["not_recommended", "不推荐", "red"],
    ["undecided", "待定", "yellow"],
    ["recommended", "推荐", "green"],
    ["highly_recommended", "非常推荐", "purple"],
  ] as const)("maps %s to its label and color", (level, label, color) => {
    const html = renderToStaticMarkup(<QualitativeRecommendationBadge level={level} />);
    expect(html).toContain(label);
    expect(html).toContain(color);
  });
});
