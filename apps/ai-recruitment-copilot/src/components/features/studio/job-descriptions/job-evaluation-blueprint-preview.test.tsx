// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { JobEvaluationBlueprint } from "@arc/db-schema/job-description-evaluation";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import {
  JobEvaluationBlueprintPreview,
  serializeEvaluationRules,
} from "./job-evaluation-blueprint-preview";

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

  it("shows all editable scoring content in one text area", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onDeductionRulesChange = vi.fn();
    const onRuleDraftChange = vi.fn();

    act(() => {
      root.render(
        <JobEvaluationBlueprintPreview
          deductionRules={createDefaultJobDescriptionStructuredConfig().deductionRules}
          onDeductionRulesChange={onDeductionRulesChange}
          onRuleDraftChange={onRuleDraftChange}
          ruleDraft={toJobEvaluationRuleDraft(blueprint)}
        />,
      );
    });

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(container.querySelectorAll("textarea")).toHaveLength(1);
    if (!textarea) {
      throw new Error("expected the complete scoring rules text area");
    }
    expect(textarea.ariaLabel).toBe("完整评分规则");
    expect(textarea.value).toContain("【技能】");
    expect(textarea.value).toContain("精通React");
    expect(textarea.value).toContain("【经验】");
    expect(textarea.value).toContain("管理3-6人团队");
    expect(textarea.value).toContain("【项目】");
    expect(textarea.value).toContain("主导核心项目");
    expect(textarea.value).toContain("【学历】");
    expect(textarea.value).toContain("本科及以上");
    expect(textarea.value).toContain("【潜力】");
    expect(textarea.value).toContain("持续学习");
    expect(textarea.value).toContain("【稳定】");
    expect(textarea.value).toContain("可长期驻外");
    expect(textarea.value).toContain("岗位判断依据：");
    expect(textarea.value).toContain("计分规则：");
    expect(textarea.value).not.toContain("评分标准：");
    expect(textarea.value).not.toContain("评估项目：");
    expect(textarea.value).not.toContain("扣分规则：");
    expect(textarea.value).not.toContain("- 未设置");
    expect(textarea.value).not.toContain("权重");
    expect(container.querySelectorAll("[data-dimension-rule], input, details")).toHaveLength(0);

    const editedRules = textarea.value
      .replace("精通React", "熟练掌握 React")
      .replace("每缺失 1 项核心技能：-14 分", "每缺失 1 项核心技能：-18 分");
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, editedRules);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onRuleDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensionExpectations: expect.objectContaining({ skillMatch: ["熟练掌握 React"] }),
      }),
    );
    expect(onDeductionRulesChange).toHaveBeenCalledWith(
      expect.objectContaining({ "skill.missing_core": { enabled: true, points: 18 } }),
    );

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
