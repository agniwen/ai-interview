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
  evaluation: "符合岗位要求。",
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
    skillMatch: dimension,
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

async function render(collapsibleDimensions: boolean) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(() => {
    root.render(
      <QualitativeEvaluationDetails
        collapsibleDimensions={collapsibleDimensions}
        evaluation={evaluation}
      />,
    );
  });
  return container;
}

describe("QualitativeEvaluationDetails collapsible dimensions", () => {
  it("keeps six dimensions collapsed until the toggle is clicked", async () => {
    const container = await render(true);
    const toggle = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("展开"),
    );

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-qualitative-radar-panel]")).toBeNull();
    expect(container.querySelector("[data-qualitative-overall-judgment]")).not.toBeNull();

    await act(() => {
      toggle?.click();
    });

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-qualitative-radar-panel]")).not.toBeNull();
  });

  it("shows six dimensions directly when not collapsible", async () => {
    const container = await render(false);

    expect(container.querySelector("[data-qualitative-radar-panel]")).not.toBeNull();
  });
});
