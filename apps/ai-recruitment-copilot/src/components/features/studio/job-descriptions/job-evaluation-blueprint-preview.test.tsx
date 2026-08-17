// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { JobEvaluationBlueprint } from "@arc/db-schema/job-description-evaluation";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import {
  JobEvaluationBlueprintPreview,
  serializeEvaluationRules,
} from "./job-evaluation-blueprint-preview";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
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
  requiredRelevantExperiences: [],
  schemaVersion: 1,
};

describe("JobEvaluationBlueprintPreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders scoring rules as markdown", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <JobEvaluationBlueprintPreview
          deductionRules={createDefaultJobDescriptionStructuredConfig().deductionRules}
          ruleDraft={toJobEvaluationRuleDraft(blueprint)}
        />,
      );
    });

    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector(".typeset")).not.toBeNull();
    expect(container.textContent).toContain("【技能】");
    expect(container.textContent).toContain("精通React");
    expect(container.textContent).toContain("【经验】");
    expect(container.textContent).toContain("管理3-6人团队");
    expect(container.textContent).toContain("【项目】");
    expect(container.textContent).toContain("主导核心项目");
    expect(container.textContent).toContain("【学历】");
    expect(container.textContent).toContain("本科及以上");
    expect(container.textContent).toContain("【潜力】");
    expect(container.textContent).toContain("持续学习");
    expect(container.textContent).toContain("【稳定】");
    expect(container.textContent).toContain("可长期驻外");
    expect(container.textContent).toContain("岗位判断依据：");
    expect(container.textContent).toContain("计分规则：");
    expect(container.textContent).not.toContain("评分标准：");
    expect(container.textContent).not.toContain("评估项目：");
    expect(container.textContent).not.toContain("扣分规则：");
    expect(container.textContent).not.toContain("- 未设置");
    expect(container.textContent).not.toContain("权重");
    expect(container.querySelectorAll("[data-dimension-rule], input, details")).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("omits the job benchmark heading when a dimension has no extracted benchmark", () => {
    const ruleDraft = toJobEvaluationRuleDraft(blueprint);
    ruleDraft.dimensionExpectations.projectMatch = [];

    const rules = serializeEvaluationRules({
      deductionRules: createDefaultJobDescriptionStructuredConfig().deductionRules,
      ruleDraft,
    });
    const projectSection = rules.match(/【项目】([\s\S]*?)【学历】/)?.[1];

    expect(projectSection).toBeDefined();
    expect(projectSection).not.toContain("岗位判断依据：");
    expect(projectSection).toContain("计分规则：");
  });
});
