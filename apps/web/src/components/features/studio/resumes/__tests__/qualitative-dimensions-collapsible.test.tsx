// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { installNoopWebAnimations } from "@/test-utils/react-act";
import { QualitativeEvaluationDetails } from "../qualitative-resume-evaluation-panel";

// SAFETY: Vitest's jsdom global supports React's documented act-environment marker.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopWebAnimations();

const dimension = {
  basis: "job",
  evaluation: "**符合**岗位要求。",
  level: "recommended",
} as const;

const evaluation = {
  conciseOverall: "整体匹配。",
  detailedOverall: { judgment: "契合。", matchingEvidence: "- 依据", risks: "- 风险" },
  dimensions: {
    educationBackground: dimension,
    experienceRelevance: dimension,
    potential: dimension,
    projectMatch: dimension,
    skillMatch: { ...dimension, evaluation: "React 实践充分。", level: "highly_recommended" },
    stability: dimension,
  },
  recommendationLevel: "recommended",
  schemaVersion: 2,
  seniorityRecommendation: null,
  teamPositioning: null,
} as const;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("QualitativeEvaluationDetails dimension rows", () => {
  it("lists every dimension and expands one row's full evaluation on click", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() => {
      root.render(<QualitativeEvaluationDetails evaluation={evaluation} />);
    });

    const rows = container.querySelectorAll<HTMLButtonElement>(
      "[data-qualitative-dimension-header]",
    );
    expect(rows).toHaveLength(6);
    const skillRow = container.querySelector<HTMLButtonElement>(
      '[data-qualitative-dimension-header="skillMatch"]',
    );
    expect(skillRow?.getAttribute("aria-label")).toContain("技能匹配：非常推荐");
    expect(skillRow?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-qualitative-dimension-basis]")).toBeNull();

    await act(() => {
      skillRow?.click();
    });

    expect(skillRow?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-qualitative-dimension-basis]")).toHaveLength(1);
  });
});
