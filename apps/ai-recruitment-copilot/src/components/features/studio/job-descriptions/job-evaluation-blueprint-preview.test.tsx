// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { JobEvaluationBlueprint } from "@arc/db-schema/job-description-evaluation";
import { JobEvaluationBlueprintPreview } from "./job-evaluation-blueprint-preview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sourceRef = { kind: "job_description" as const, path: "prompt" };

const blueprint: JobEvaluationBlueprint = {
  auxiliarySkills: [],
  compiler: {
    generatedAt: "2026-07-31T00:00:00.000Z",
    modelId: "test/model",
    promptVersion: "test-v1",
  },
  coreSkills: [],
  dimensionExpectations: {
    educationBackground: [{ expectation: "本科及以上", sourceRef, sourceText: "本科及以上" }],
    experienceRelevance: [{ expectation: "管理3-6人团队", sourceRef, sourceText: "管理3-6人团队" }],
    potential: [{ expectation: "持续学习", sourceRef, sourceText: "持续学习" }],
    projectMatch: [{ expectation: "主导核心项目", sourceRef, sourceText: "主导核心项目" }],
    skillMatch: [{ expectation: "精通React", sourceRef, sourceText: "精通React" }],
    stability: [{ expectation: "可长期驻外", sourceRef, sourceText: "可长期驻外" }],
  },
  educationExpectation: null,
  exclusionConditions: [],
  hardGateRequirements: [],
  priorityConditions: [],
  requiredRelevantExperience: null,
  schemaVersion: 1,
};

describe("JobEvaluationBlueprintPreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the recognized standards for all six scoring dimensions", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <JobEvaluationBlueprintPreview
          blueprint={blueprint}
          weights={{
            educationBackground: 10,
            experienceRelevance: 25,
            potential: 8,
            projectMatch: 15,
            skillMatch: 35,
            stability: 7,
          }}
        />,
      );
    });

    expect(container.textContent).toContain("六维评分标准");
    expect(container.textContent).toContain("技能35%");
    expect(container.textContent).toContain("精通React");
    expect(container.textContent).toContain("经验25%");
    expect(container.textContent).toContain("管理3-6人团队");
    expect(container.textContent).toContain("项目15%");
    expect(container.textContent).toContain("主导核心项目");
    expect(container.textContent).toContain("学历10%");
    expect(container.textContent).toContain("本科及以上");
    expect(container.textContent).toContain("潜力8%");
    expect(container.textContent).toContain("持续学习");
    expect(container.textContent).toContain("稳定7%");
    expect(container.textContent).toContain("可长期驻外");

    act(() => {
      root.unmount();
    });
  });
});
