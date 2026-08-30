// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { JsonValue } from "@arc/db-schema/json";
import { StructuredResumeEvaluationPanel } from "../structured-resume-evaluation-panel";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dimension = (rawScore: number, weight: number, ruleId: string, reason: string) => ({
  appliedDeductions:
    rawScore < 100
      ? [
          {
            appliedPoints: 100 - rawScore,
            evidence: [{ quote: "主导支付系统重构", source: "resume_text" }],
            reason,
            ruleId,
            status: "matched",
          },
        ]
      : [],
  deductionTotal: 100 - rawScore,
  insufficientEvidenceRuleIds: [],
  rawScore,
  ruleJudgments: [
    {
      evidence: [{ quote: "主导支付系统重构", source: "resume_text" }],
      reason,
      ruleId,
      status: rawScore < 100 ? "matched" : "not_matched",
    },
  ],
  weight,
  weightedContributionHundredths: rawScore * weight,
});

type DetailFixture = Readonly<Record<string, JsonValue | undefined>>;

function parseDetailFixture(fixture: DetailFixture): ResumeLibraryDetail {
  // SAFETY: The fixture is authored in this test and matches the rendered detail contract.
  const partial = { ...({} as Partial<ResumeLibraryDetail>), ...structuredClone(fixture) };
  // SAFETY: The fixture above supplies the fields exercised by this renderer test.
  return partial as ResumeLibraryDetail;
}

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing test element: ${selector}`);
  }
  return element;
}

function createDetail(): ResumeLibraryDetail {
  const jobConfig = createDefaultJobDescriptionStructuredConfig();
  jobConfig.deductionRules["experience.missing_year"].points = 15;
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return parseDetailFixture({
    id: "resume-1",
    jobEvaluationMode: "structured",
    resumeEvaluationStatus: "pass",
    resumeReviewRunId: "run-1",
    resumeReviewStatus: "ready",
    structuredResumeEvaluation: {
      adjustments: {
        exclusionPointTotal: 0,
        matches: [
          {
            appliedPoints: 5,
            conditionId: "priority-1",
            evidence: [
              { quote: "拥有支付行业经验", source: "resume_text" },
              { quote: "拥有支付行业经验", source: "resume_text" },
            ],
            kind: "priority",
            matched: true,
            points: 5,
            reason: "符合优先条件",
            sourceText: "支付行业经验",
          },
        ],
        priorityPointTotal: 0,
      },
      blueprint: {
        auxiliarySkills: [],
        coreSkills: [],
        dimensionExpectations: {
          educationBackground: [
            {
              expectation: "本科及以上学历",
              sourceRef: { kind: "job_description", path: "description" },
              sourceText: "本科及以上学历",
            },
          ],
          experienceRelevance: [
            {
              expectation: "至少 5 年相关经验",
              sourceRef: { kind: "job_description", path: "description" },
              sourceText: "至少 5 年相关经验",
            },
          ],
          potential: [
            {
              expectation: "具备持续学习能力",
              sourceRef: { kind: "job_description", path: "description" },
              sourceText: "具备持续学习能力",
            },
          ],
          projectMatch: [
            {
              expectation: "主导复杂业务项目",
              sourceRef: { kind: "job_description", path: "description" },
              sourceText: "主导复杂业务项目",
            },
          ],
          skillMatch: [
            {
              expectation: "掌握 TypeScript 与 React",
              sourceRef: { kind: "job_description", path: "description" },
              sourceText: "掌握 TypeScript 与 React",
            },
          ],
          stability: [
            {
              expectation: "履历保持稳定",
              sourceRef: { kind: "job_description", path: "description" },
              sourceText: "履历保持稳定",
            },
          ],
        },
        educationExpectation: null,
        requiredRelevantExperience: null,
      },
      calculations: {
        adjustedHundredths: 8660,
        clampedHundredths: 8660,
        compositeScore: 87,
        weightedBaseHundredths: 8660,
      },
      dimensions: {
        educationBackground: dimension(80, 10, "education.below_tier", "学历低于岗位要求"),
        experienceRelevance: dimension(85, 25, "experience.missing_year", "相关经验缺少两年。"),
        potential: dimension(92, 8, "potential.no_growth_two_years", "近期成长记录不足"),
        projectMatch: dimension(88, 15, "project.old_relevant_project", "相关项目距今较久"),
        skillMatch: dimension(90, 0, "skill.missing_core", "缺少核心技能"),
        stability: dimension(79, 42, "stability.short_tenure", "存在短期任职经历"),
      },
      gates: {
        effectiveStatus: "failed",
        judgments: [
          {
            aiStatus: "failed",
            category: "学历",
            evidence: [
              { quote: "最高学历为大专", source: "resume_profile" },
              { quote: "最高学历为大专", source: "resume_profile" },
            ],
            reason: "未达到本科要求",
            requirementId: "gate-1",
          },
        ],
        rawStatus: "failed",
      },
      grade: "recommended",
      jobConfig,
      narrative: {
        dimensionComments: {
          educationBackground: "学历背景存在明确差距，其他背景要求未触发扣分。",
          experienceRelevance: "相关经验整体充分，但经验年限仍有扣分项。",
          potential: "近期成长证据偏弱，其余潜力信号未触发扣分。",
          projectMatch: "项目方向匹配，但项目新鲜度存在扣分。",
          skillMatch: "核心技能有缺口，已有技能具备实操证据。",
          stability: "存在短期任职，其余稳定性规则未触发扣分。",
        },
        levelRecommendation: {
          level: "高级",
          rationale: "具备复杂项目交付经验，但需核实岗位门槛。",
        },
        overallComment: "候选人的技能与项目经验具有匹配基础，但学历门槛和部分经历仍有风险。",
        recommendation: "建议进入下一轮",
        summary: "技能和经验整体匹配",
        teamPositioning: {
          rationale: "支付系统重构经历与岗位核心职责相符。",
          suggestion: "核心业务研发",
        },
      },
      runId: "run-1",
      skillAssessments: [
        {
          evidence: [{ quote: "主导支付系统重构", source: "resume_text" }],
          expectationType: "core",
          normalizedSkill: "TypeScript",
          reason: "有实际项目运用证据",
          requirementGroupId: "skill-group-typescript",
          satisfactionMode: "all",
          sourceRef: { kind: "job_description", path: "description" },
          sourceText: "熟练掌握 TypeScript",
          status: "applied",
        },
        {
          evidence: [],
          expectationType: "core",
          normalizedSkill: "React",
          reason: "简历未体现 React",
          requirementGroupId: "skill-group-frontend-framework",
          satisfactionMode: "any",
          sourceRef: { kind: "job_description", path: "description" },
          sourceText: "熟练掌握 React",
          status: "missing",
        },
        {
          evidence: [{ quote: "参与 Redis 缓存设计", source: "resume_text" }],
          expectationType: "auxiliary",
          normalizedSkill: "Redis",
          reason: "仅提及相关项目，缺少直接实操说明",
          requirementGroupId: "skill-group-redis",
          satisfactionMode: "all",
          sourceRef: { kind: "job_description", path: "description" },
          sourceText: "熟悉 Redis 优先",
          status: "shallow",
        },
        {
          evidence: [],
          expectationType: "core",
          normalizedSkill: "Node.js",
          reason: "AI 未返回该岗位技能的有效判断。",
          requirementGroupId: "skill-group-frontend-framework",
          satisfactionMode: "any",
          sourceRef: { kind: "job_description", path: "description" },
          sourceText: "熟练掌握 Node.js",
          status: "insufficient_evidence",
        },
      ],
    },
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StructuredResumeEvaluationPanel", () => {
  it("renders readable gate dimensions and the specific job requirement", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const detail = createDetail();
    const evaluation = detail.structuredResumeEvaluation;
    if (!evaluation) {
      throw new Error("missing evaluation fixture");
    }

    // SAFETY: This fixture supplies the blueprint fields used by the renderer.
    const detailWithGateRequirements = {
      ...detail,
      structuredResumeEvaluation: {
        ...evaluation,
        blueprint: {
          hardGateRequirements: [
            {
              category: "other",
              normalizedRequirement: "接受海外出差",
              requirementId: "gate-other",
              sourceRef: { kind: "hard_gate", path: "hardGates.other" },
              sourceText: "接受海外出差",
            },
            {
              category: "required_skills",
              normalizedRequirement: "TypeScript",
              requirementId: "gate-skills",
              sourceRef: { kind: "hard_gate", path: "hardGates.requiredSkills" },
              sourceText: "必须具备 TypeScript 开发经验",
            },
            {
              category: "work_experience",
              normalizedRequirement: "3 年前端开发经验",
              requirementId: "gate-experience",
              sourceRef: { kind: "hard_gate", path: "hardGates.workExperience" },
              sourceText: "具备 3 年前端开发经验",
            },
          ],
        } as typeof evaluation.blueprint,
        gates: {
          ...evaluation.gates,
          judgments: [
            {
              aiStatus: "failed",
              category: "other",
              evidence: [],
              reason: "简历未说明是否接受海外出差。",
              requirementId: "gate-other",
            },
            {
              aiStatus: "passed",
              category: "required_skills",
              evidence: [],
              reason: "简历体现相关开发经验。",
              requirementId: "gate-skills",
            },
            {
              aiStatus: "needs_verification",
              category: "work_experience",
              evidence: [],
              reason: "经历时间信息不完整。",
              requirementId: "gate-experience",
            },
          ],
        },
      },
    } as ResumeLibraryDetail;

    act(() => {
      root.render(
        <StructuredResumeEvaluationPanel canEdit={false} detail={detailWithGateRequirements} />,
      );
    });

    const content = container.textContent ?? "";
    expect(content).toContain("其他：接受海外出差");
    expect(content).toContain("必备技能：必须具备 TypeScript 开发经验");
    expect(content).toContain("工作经验：具备 3 年前端开发经验");
    expect(content).not.toContain("门槛维度：");
    expect(content).not.toContain("required_skills");
    expect(content).not.toContain("work_experience");
    const firstGateHeading = container.querySelector("[data-structured-gate-heading]");
    expect(firstGateHeading?.textContent).toContain("未通过门槛");
    expect(firstGateHeading?.textContent).toContain("其他：接受海外出差");

    act(() => root.unmount());
  });

  it("renders the reassessment action inside the comprehensive evaluation header", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <StructuredResumeEvaluationPanel
          canEdit={false}
          detail={createDetail()}
          summaryAction={<button type="button">重新评估</button>}
        />,
      );
    });

    const comprehensiveHeader = [
      ...container.querySelectorAll<HTMLElement>('[data-slot="frame-panel-header"]'),
    ].find((header) => header.textContent?.includes("综合评价"));
    const action = container.querySelector("button");
    expect(action?.textContent).toBe("重新评估");
    expect(action?.closest('[data-slot="frame-panel-header"]')).toBe(comprehensiveHeader);

    act(() => root.unmount());
  });

  it("keeps HR decision primary and renders all raw dimensions including zero weight", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StructuredResumeEvaluationPanel canEdit={false} detail={createDetail()} />);
    });

    const content = container.textContent ?? "";
    expect(content).toContain("HR 已通过");
    expect(content).toContain("未通过门槛");
    expect(content).toContain("推荐");
    expect(container.querySelector("[data-structured-composite-score]")?.textContent).toBe("87");
    expect(content).toContain("技能");
    expect(content).toContain("经验");
    expect(content).toContain("项目");
    expect(content).toContain("学历");
    expect(content).toContain("潜力");
    expect(content).toContain("稳定");
    expect(content).toContain("权重 0% · 贡献 0 分");
    expect(content).toContain("最高学历为大专");
    expect(content).toContain("拥有支付行业经验");
    expect(content).toContain("整体评语：");
    expect(content).toContain("候选人的技能与项目经验具有匹配基础");
    expect(content).toContain("综合评分 87 分，处于“推荐”区间；硬性门槛未通过。");
    expect(content).not.toContain("技能和经验整体匹配");
    expect(content).toContain("职级建议");
    expect(content).toContain("高级");
    expect(content).toContain("团队定位");
    expect(content).toContain("核心业务研发");
    expect(content).toContain("技能判定明细");
    expect(content).toContain("TypeScript");
    expect(content).toContain("React");
    expect(content).toContain("Redis");
    expect(content).toContain("Node.js");
    expect(content).toContain("已应用");
    expect(content).toContain("缺失");
    expect(content).toContain("浅层");
    expect(content).toContain("证据不足");
    expect(content).toContain("任一满足");
    expect(content).toContain("简历未体现 React");
    expect(content).toContain("主导支付系统重构");
    expect(container.querySelectorAll("[data-structured-skill-assessment]")).toHaveLength(4);
    const adjustmentList = container.querySelector("[data-structured-adjustment-list]");
    expect(adjustmentList?.classList.contains("divide-y")).toBe(true);
    expect(adjustmentList?.classList.contains("p-0")).toBe(true);
    const adjustmentItems = container.querySelectorAll("[data-structured-adjustment-item]");
    expect(adjustmentItems).toHaveLength(1);
    expect(adjustmentItems[0]?.classList.contains("rounded-lg")).toBe(false);
    expect(adjustmentItems[0]?.classList.contains("border")).toBe(false);
    expect(
      Array.from(container.querySelectorAll("blockquote"), (node) => node.textContent),
    ).toEqual(expect.arrayContaining(["最高学历为大专", "拥有支付行业经验"]));
    expect(
      Array.from(container.querySelectorAll("blockquote"), (node) => node.textContent).filter(
        (text) => text === "最高学历为大专" || text === "拥有支付行业经验",
      ),
    ).toEqual(["最高学历为大专", "拥有支付行业经验"]);
    expect(content).not.toContain("AI 原始结论：");

    const frameTitles = Array.from(
      container.querySelectorAll('[data-slot="frame-panel-title"]'),
      (element) => element.textContent,
    );
    expect(frameTitles.slice(0, 2)).toEqual(["综合评价", "维度评分"]);
    expect(frameTitles.slice(2, 6)).toEqual(["技能判定明细", "硬性门槛", "职级建议", "团队定位"]);
    const recommendationPanels = ["职级建议", "团队定位"].map((title) => {
      const frameTitle = [
        ...container.querySelectorAll<HTMLElement>('[data-slot="frame-panel-title"]'),
      ].find((element) => element.textContent === title);
      return frameTitle
        ?.closest('[data-slot="frame"]')
        ?.querySelector<HTMLElement>('[data-slot="frame-panel"]');
    });
    expect(recommendationPanels).toHaveLength(2);
    expect(recommendationPanels.every((panel) => panel?.classList.contains("flex-1"))).toBe(true);
    expect(container.querySelectorAll("[data-structured-dimension-group]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-structured-dimension-score]")).toHaveLength(6);
    expect(container.querySelector<HTMLElement>("[data-radar-order]")?.dataset.radarOrder).toBe(
      "skillMatch,experienceRelevance,stability,educationBackground,potential,projectMatch",
    );
    const experienceDimension = getRequiredElement<HTMLElement>(
      container,
      '[data-structured-dimension-score="experienceRelevance"]',
    );
    expect(
      container.querySelectorAll("[data-structured-dimension-requirements-trigger]"),
    ).toHaveLength(6);
    expect(experienceDimension.textContent).toContain("查看要求");
    expect(experienceDimension.textContent).not.toContain("至少 5 年相关经验");
    expect(experienceDimension.textContent).toContain("AI 判断");
    expect(experienceDimension.textContent).toContain("相关经验整体充分");
    expect(experienceDimension.textContent).toContain("相关经验缺少两年，扣 15 分");
    expect(experienceDimension.textContent).toContain("本维度合计扣 15 分");
    expect(experienceDimension.textContent).not.toContain("经验年限不足");
    expect(experienceDimension.textContent).not.toContain("未扣分方面");
    expect(experienceDimension.textContent).not.toContain("证据不足项");
    expect(experienceDimension.textContent).not.toContain("标准化扣分明细");
    expect(frameTitles).not.toContain("标准化扣分明细");

    const requirementTrigger = getRequiredElement<HTMLButtonElement>(
      experienceDimension,
      "[data-structured-dimension-requirements-trigger]",
    );
    const deductionSummary = getRequiredElement(
      experienceDimension,
      "[data-structured-dimension-deduction-summary]",
    );
    expect(deductionSummary.textContent).toContain("本维度合计扣 15 分");
    expect(deductionSummary.contains(requirementTrigger)).toBe(true);
    act(() => requirementTrigger.focus());

    await vi.waitFor(() => {
      const requirementCard = document.body.querySelector('[data-slot="hover-card-content"]');
      expect(requirementCard?.textContent).toContain("经验维度");
      expect(requirementCard?.textContent).toContain("岗位要求");
      expect(requirementCard?.textContent).toContain("至少 5 年相关经验");
      expect(requirementCard?.textContent).toContain("扣分规则");
      expect(requirementCard?.textContent).toContain("相关经验每缺少 1 年");
      expect(requirementCard?.textContent).toContain("扣 15 分");
    });

    act(() => root.unmount());
  });

  it("labels a retained prior result when the latest reassessment fails", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const detail = {
      ...createDetail(),
      resumeReviewError: "AI 分析生成失败。",
      resumeReviewRunId: "run-2",
      resumeReviewStatus: "failed",
    } as ResumeLibraryDetail;

    act(() => {
      root.render(<StructuredResumeEvaluationPanel canEdit={false} detail={detail} />);
    });

    expect(container.textContent).toContain("AI 分析生成失败。");
    expect(container.textContent).toContain("当前展示上一次已完成的评估结果");
    expect(container.querySelector("[data-structured-composite-score]")?.textContent).toBe("87");

    act(() => root.unmount());
  });

  it("builds readable dimension comments for older structured evaluations", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const detail = createDetail();
    const evaluation = detail.structuredResumeEvaluation;
    if (!evaluation) {
      throw new Error("missing evaluation fixture");
    }
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const legacyDetail = {
      ...detail,
      structuredResumeEvaluation: {
        ...evaluation,
        narrative: {
          recommendation: evaluation.narrative.recommendation,
          summary: evaluation.narrative.summary,
        },
      },
    } as ResumeLibraryDetail;

    act(() => {
      root.render(<StructuredResumeEvaluationPanel canEdit={false} detail={legacyDetail} />);
    });

    const experienceDimension = container.querySelector(
      '[data-structured-dimension-score="experienceRelevance"]',
    );
    expect(experienceDimension?.textContent).toContain("该维度整体表现较好");
    expect(experienceDimension?.textContent).toContain("相关经验缺少两年，扣 15 分");
    expect(experienceDimension?.textContent).not.toContain("经验年限不足");
    expect(experienceDimension?.textContent).not.toContain("。。");
    expect(container.textContent).not.toContain("整体评语：");

    act(() => root.unmount());
  });

  it("does not allow correcting gates on a retained result from an older run", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const detail = {
      ...createDetail(),
      resumeReviewRunId: "run-2",
      resumeReviewStatus: "processing",
    } as ResumeLibraryDetail;

    act(() => {
      root.render(
        <StructuredResumeEvaluationPanel
          canEdit
          detail={detail}
          onUpdated={vi.fn()}
          slug="light"
        />,
      );
    });

    expect(container.textContent).toContain("当前展示上一次已完成的评估结果");
    expect(container.textContent).not.toContain("标记通过");
    expect(container.textContent).not.toContain("标记未通过");

    act(() => root.unmount());
  });
});
