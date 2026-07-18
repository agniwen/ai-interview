import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { z } from "zod";
import {
  generateStructuredWithMastraAgent,
  resumeReviewMarkdownAgent,
  resumeReviewQualitativeAgent,
  resumeReviewScoringAgent,
  streamTextWithMastraAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import { createAiRunEventStream } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";
import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { constrainNextStepAction } from "@arc/shared/resume-evaluation-decision";
import type { ResumeReview } from "@arc/shared/resume-review";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
import {
  RESUME_REVIEW_DIMENSIONS,
  RESUME_REVIEW_SCHEMA_VERSION,
  computeResumeReviewBaseScore,
  formatResumeReviewMarkdown,
  formatResumeReviewFrameworkWeights,
  resumeReviewActionSchema,
  resumeReviewBiasItemSchema,
  resumeReviewDimensionSchema,
  resumeReviewPointSchema,
} from "@arc/shared/resume-review";

const RESUME_REVIEW_SERVER_TIME_ZONE = "Asia/Shanghai";

function buildResumeReviewTimeContext(now = new Date()) {
  const formattedNow = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: RESUME_REVIEW_SERVER_TIME_ZONE,
  }).format(now);

  return [
    `当前服务端时间（${RESUME_REVIEW_SERVER_TIME_ZONE}）：${formattedNow}`,
    "时间判断规则：判断候选人的在职时长、工作年限、项目持续时间、是否仍在职、时间线是否合理时，以上述服务端时间作为“现在”；简历中的“至今”“最近”“目前”默认按该时间理解。不要使用模型训练时间或系统外部假设代替当前时间。",
  ].join("\n");
}

type AiRunEventDraft = AiRunEvent extends infer T
  ? T extends { runId: string }
    ? Omit<T, "runId"> & { runId?: string }
    : never
  : never;

function emitForegroundWorkflowEvent(
  event: AiRunEvent,
  emitAiRun: (event: AiRunEventDraft) => void,
) {
  if (
    event.type === "run.started" ||
    event.type === "run.completed" ||
    event.type === "run.failed"
  ) {
    return;
  }
  if (event.type === "step.completed") {
    emitAiRun({
      runId: event.runId,
      stepId: event.stepId,
      traceId: event.traceId,
      type: "step.completed",
    });
    return;
  }
  emitAiRun(event);
}

function getRecordValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : null;
}

function emitResumeReviewWorkflowEvent(
  event: AiRunEvent,
  emitAiRun: (event: AiRunEventDraft) => void,
) {
  if (event.type === "step.completed" && event.stepId === "scoring") {
    const scoring = getRecordValue(event.output, "scoring");
    // oxlint-disable-next-line no-use-before-define -- event bridge is defined before the local review schemas.
    const parsed = resumeScoringSchema.safeParse(scoring);
    if (parsed.success) {
      emitAiRun({
        artifactType: "resume.review.scoring",
        data: {
          baseScore: computeResumeReviewBaseScore(parsed.data.dimensions),
          dimensions: parsed.data.dimensions,
        },
        stepId: "scoring",
        type: "step.preview",
      });
    }
  }

  if (event.type === "step.completed" && event.stepId === "compose-review") {
    const review = getRecordValue(event.output, "review");
    const structuredReview = getRecordValue(event.output, "structuredReview");
    if (typeof review === "string" && review.trim()) {
      emitAiRun({
        stepId: "compose-review",
        text: review,
        type: "step.delta",
      });
      emitAiRun({
        artifactType: "resume.review.result",
        data: { review, structuredReview },
        stepId: "compose-review",
        type: "step.preview",
      });
    }
  }

  emitForegroundWorkflowEvent(event, emitAiRun);
}

const nonEmpty = z.string().trim().min(1);
function formatResumeScreeningForPrompt(result?: ResumeScreeningResult | null) {
  if (!result || result.policyEmpty || !result.policyEnabled) {
    return "";
  }
  const recommendationLabel: Record<ResumeScreeningResult["recommendation"], string> = {
    flag: "需人工核实",
    hold: "建议暂缓推进",
    pass: "未发现筛选风险",
  };
  const ruleLines = result.ruleResults.map((rule, index) => {
    const evidence = rule.evidence
      .map((item) => item.quote || item.explanation)
      .filter(Boolean)
      .slice(0, 2)
      .join("；");
    return `${index + 1}. [${rule.severity}/${rule.status}] ${rule.label}：${rule.reason}${evidence ? `（证据：${evidence}）` : ""}`;
  });
  return `\n\n已确认的简历筛选结果（只作为风险提示，不得自动淘汰候选人）：\n总体建议：${recommendationLabel[result.recommendation]}\n${ruleLines.join("\n")}`;
}

// Agent 1 prompt —— 只输出定性内容，不出现任何 score 字段。
const REVIEW_QUALITATIVE_INSTRUCTIONS = `你是一名招聘评估助手。根据候选人简历和在招岗位（如有），输出一份结构化的定性评价。
本阶段只输出文字结论与归因，不要输出任何分数、等级或数字评分；评分由下游处理。

## 输出要求
- 只输出 JSON 对象，不要输出 Markdown、代码块或解释性文字。
- 所有自由文本字段使用中文，简洁直入，不要寒暄。
- 严格遵守字段名、枚举值和数据类型；无证据时 evidence 填 null，文本写"待核实"。
- 不要编造简历或 JD 中没有的信息。

## 评价内容
1. overall.conclusion：一句话总体判断，描述候选人与岗位的语义匹配方向，不要出现任何数字。
2. strengths（匹配亮点）：1-4 条，每条给出 point + evidence（简历原文证据或 null）+ impact（对岗位匹配的影响）。
3. weaknesses（风险点）：1-4 条，同上结构。
4. biasScan.items（偏差扫描，可为空数组）：
   - 枚举：hard_gap（硬缺口）/ soft_mismatch（软错位）/ credibility_risk（真实性存疑）/ stability_signal（稳定性信号）
   - 每条给出 description + category + impact。
5. teamPositioning：suggestion 给出可执行的团队类型或职责方向，rationale 给出定位依据。
6. levelRecommendation：level 用"初级 / 初中级 / 中级 / 中高级 / 高级 / 资深 / 专家"或 P 级表示，rationale 给出职级依据。
7. nextStep：基于定性判断给出初步建议：
   - action ∈ {interview, hold, reject}
   - rationale：依据（仅基于定性判断，不涉及最终分数）
   - interviewFocus：进入面试或暂缓时建议重点追问的问题，可为空数组
   - disclaimer：必须严格等于"以上为初步结论"

## 输出 JSON 结构（必须严格遵守）
{
  "overall": {
    "conclusion": "一句话总体判断"
  },
  "strengths": [
    { "point": "亮点", "evidence": "简历证据或 null", "impact": "对岗位匹配的影响" }
  ],
  "weaknesses": [
    { "point": "风险点", "evidence": "简历证据或 null", "impact": "对岗位匹配的影响" }
  ],
  "biasScan": {
    "items": [
      {
        "description": "偏差描述",
        "category": "hard_gap" | "soft_mismatch" | "credibility_risk" | "stability_signal",
        "impact": "对岗位胜任的影响"
      }
    ]
  },
  "teamPositioning": {
    "suggestion": "可执行的团队类型或职责方向",
    "rationale": "定位依据"
  },
  "levelRecommendation": {
    "level": "初级 / 初中级 / 中级 / 中高级 / 高级 / 资深 / 专家，或 P 级",
    "rationale": "职级依据"
  },
  "nextStep": {
    "action": "interview" | "hold" | "reject",
    "rationale": "下一步建议依据（仅基于定性判断）",
    "interviewFocus": ["如果进入面试或暂缓，建议重点追问的问题；可为空数组"],
    "disclaimer": "以上为初步结论"
  }
}

## 约束
- strengths 与 weaknesses 各 1-4 条。
- biasScan.items 可为空数组，为空表示未发现关键偏差。
- evidence 只能引用关键证据，禁止复述简历或 JD 全文。
- nextStep.disclaimer 必须严格等于"以上为初步结论"。
- 不要输出 dimensions、overall.score、baseScore、等级标签等任何数字评分字段——这是下游 Agent 的职责。`;

const REVIEW_MARKDOWN_INSTRUCTIONS = `你是一名招聘评估撰写助手。根据候选人结构化简历和在招岗位（如有），生成一份可直接写入「简历评价」编辑器的中文 Markdown。

## 输出要求
- 只输出 Markdown 正文，不要输出 JSON、代码块或解释性前后缀。
- 总长度控制在 2000 字以内，语言简洁、招聘视角明确。
- 必须基于简历和 JD，不要编造未出现的信息。
- 如果没有 JD，按候选人的 targetRoles 推断目标方向，但要避免过度下结论。
- 内容需要能被后续结构化评分复用，结论、亮点、风险和建议之间保持一致。

## 建议结构
### 总体判断
一句话说明匹配方向。

### 匹配亮点
- 1-4 条，每条包含证据和对岗位的影响。

### 风险与待核实
- 1-4 条，每条说明风险和面试核实点。

### 建议
给出进入面试、暂缓或拒绝的初步建议，并附一句「以上为初步结论」。`;

const REVIEW_QUALITATIVE_FROM_MARKDOWN_INSTRUCTIONS = `${REVIEW_QUALITATIVE_INSTRUCTIONS}

## 额外输入
你还会收到一份已经展示给招聘人员的 Markdown 简历评价。请以这份 Markdown 的判断方向为准，将其中的总体判断、亮点、风险和建议整理成结构化定性评价。
- 不要改变 Markdown 中已经表达的核心判断。
- 如 Markdown 与简历/JD 明显矛盾，以简历/JD 为准，但要保持整体方向尽量一致。
- 仍然不要输出任何分数。`;

const REVIEW_SCORING_DIMENSION_LIST = RESUME_REVIEW_DIMENSIONS.map(
  (dimension, index) =>
    `${index + 1}. ${dimension.label}（权重 ${Math.round(dimension.weight * 100)}%）：${dimension.checklist.join("；")}。输出 key: ${dimension.key}`,
).join("\n");

const REVIEW_SCORING_JSON_SHAPE = RESUME_REVIEW_DIMENSIONS.map(
  (dimension) =>
    `    "${dimension.key}": { "score": 0-100, "rationale": "${dimension.label}评分依据" }`,
).join(",\n");

// Agent 2 prompt —— 拿简历 + JD + Agent 1 输出，只输出产品六维框架分。
const REVIEW_SCORING_INSTRUCTIONS = `你是一名招聘评分助手。基于已生成的定性评价、候选人简历、在招岗位描述，对简历与岗位的语义匹配度进行六维度打分。
本阶段只输出每维度的分数与依据，不输出总分或综合结论；总分由调用方按权重计算。

## 评分维度与权重（仅供你心中校准，不必输出占比）
${REVIEW_SCORING_DIMENSION_LIST}

## 输出要求
- 每个维度输出 0-100 的整数 score 与一句中文 rationale。
- rationale 要点出"判断依据 + 关键证据"，可引用下游定性评价中的 strengths/weaknesses 或直接引用简历原文；不要泛泛而谈。
- 不要输出 Markdown、代码块或解释性文字；只输出 JSON 对象。
- 不要编造简历或 JD 中没有的信息。

## 与定性评价的一致性
- 若你的打分方向与定性评价的结论、strengths、weaknesses 出现冲突（例如定性说"技术栈高度匹配"，你给技能匹配度打低分），以定性结论方向为准，并在该维度 rationale 开头用"已采纳定性结论"一句说明，再写评分依据。

## 输出 JSON 结构（必须严格遵守）
{
  "dimensions": {
${REVIEW_SCORING_JSON_SHAPE}
  }
}

## 约束
- 顶层只有 dimensions 字段，不要输出 overall / strengths / weaknesses / nextStep 等其他字段。
- 每个 score 是 0-100 的整数，rationale 非空。`;

// Agent 1 定性输出的内部类型 —— 不持久化，只传给 Agent 2 和组装层。
// Internal type for Agent 1 output; not persisted, only fed to Agent 2 + assembler.
const resumeQualitativeSchema = z.object({
  biasScan: z.object({
    items: z.array(resumeReviewBiasItemSchema),
  }),
  levelRecommendation: z.object({
    level: nonEmpty,
    rationale: nonEmpty,
  }),
  nextStep: z.object({
    action: resumeReviewActionSchema,
    disclaimer: z.literal("以上为初步结论"),
    interviewFocus: z.array(nonEmpty),
    rationale: nonEmpty,
  }),
  overall: z.object({
    conclusion: nonEmpty,
  }),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmpty,
    suggestion: nonEmpty,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});
export type ResumeQualitativeReview = z.infer<typeof resumeQualitativeSchema>;

// Agent 2 打分输出的内部类型。
const resumeScoringSchema = z.object({
  dimensions: z.object({
    educationBackground: resumeReviewDimensionSchema,
    experienceRelevance: resumeReviewDimensionSchema,
    potential: resumeReviewDimensionSchema,
    projectMatch: resumeReviewDimensionSchema,
    skillMatch: resumeReviewDimensionSchema,
    stability: resumeReviewDimensionSchema,
  }),
});
export type ResumeReviewScoring = z.infer<typeof resumeScoringSchema>;

function buildResumeReviewPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
  semanticRequirements?: string[] | null;
}) {
  const jdBlock = input.jobDescription?.trim()
    ? `在招岗位描述：\n${input.jobDescription.trim()}`
    : "在招岗位描述：（未指定 JD，按候选人 targetRoles 推断目标方向进行评估；产品六维评分框架中的岗位匹配判断均以候选人简历的目标岗位方向为参照）";

  const semanticBlock =
    input.semanticRequirements && input.semanticRequirements.length > 0
      ? `\n\nJD 中的语义硬性要求（无法用规则匹配，请在偏差扫描中判断候选人是否满足，不满足时标注为 hard_gap）：\n${input.semanticRequirements.map((req, i) => `${i + 1}. ${req}`).join("\n")}`
      : "";
  const screeningBlock = formatResumeScreeningForPrompt(input.screeningResult);

  return `${buildResumeReviewTimeContext()}\n\n${jdBlock}${semanticBlock}${screeningBlock}\n\n候选人简历（结构化 JSON）：\n${JSON.stringify(input.resumeProfile, null, 2)}`;
}

function buildResumeReviewMarkdownPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
}) {
  return buildResumeReviewPrompt(input);
}

function buildResumeReviewFromMarkdownPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
  reviewMarkdown: string;
}) {
  return [
    buildResumeReviewPrompt(input),
    `已生成并展示给用户的 Markdown 简历评价：\n${input.reviewMarkdown.trim()}`,
  ].join("\n\n");
}

function buildResumeScoringPrompt(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
  qualitative: ResumeQualitativeReview;
  reviewMarkdown?: string | null;
}) {
  const jdBlock = input.jobDescription?.trim()
    ? `在招岗位描述：\n${input.jobDescription.trim()}`
    : "在招岗位描述：（未指定 JD，按候选人 targetRoles 推断目标方向打分）";
  const parts = [
    buildResumeReviewTimeContext(),
    jdBlock,
    formatResumeScreeningForPrompt(input.screeningResult).trim(),
    `候选人简历（结构化 JSON）：\n${JSON.stringify(input.resumeProfile, null, 2)}`,
    `定性评价（Step 1 输出，已在内容上与岗位比对过，请保持打分方向一致）：\n${JSON.stringify(input.qualitative, null, 2)}`,
  ].filter(Boolean);
  if (input.reviewMarkdown?.trim()) {
    parts.push(
      `已展示给用户的 Markdown 简历评价（打分方向必须与此文本一致）：\n${input.reviewMarkdown.trim()}`,
    );
  }
  return parts.join("\n\n");
}

export async function generateResumeQualitativeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
  semanticRequirements?: string[] | null;
}): Promise<ResumeQualitativeReview> {
  return await generateStructuredWithMastraAgent({
    agent: resumeReviewQualitativeAgent,
    prompt: `${REVIEW_QUALITATIVE_INSTRUCTIONS}\n\n${buildResumeReviewPrompt(input)}`,
    schema: resumeQualitativeSchema,
    temperature: 0.4,
  });
}

function generateResumeReviewMarkdown(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
}): AsyncIterable<string> {
  return streamTextWithMastraAgent({
    agent: resumeReviewMarkdownAgent,
    maxOutputTokens: 1800,
    prompt: `${REVIEW_MARKDOWN_INSTRUCTIONS}\n\n${buildResumeReviewMarkdownPrompt(input)}`,
    temperature: 0.4,
  });
}

export async function generateResumeQualitativeReviewFromMarkdown(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
  reviewMarkdown: string;
}): Promise<ResumeQualitativeReview> {
  return await generateStructuredWithMastraAgent({
    agent: resumeReviewQualitativeAgent,
    prompt: `${REVIEW_QUALITATIVE_FROM_MARKDOWN_INSTRUCTIONS}\n\n${buildResumeReviewFromMarkdownPrompt(input)}`,
    schema: resumeQualitativeSchema,
    temperature: 0.2,
  });
}

export async function generateResumeReviewScoring(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
  qualitative: ResumeQualitativeReview;
  reviewMarkdown?: string | null;
}): Promise<ResumeReviewScoring> {
  return await generateStructuredWithMastraAgent({
    agent: resumeReviewScoringAgent,
    prompt: `${REVIEW_SCORING_INSTRUCTIONS}\n\n${buildResumeScoringPrompt(input)}`,
    schema: resumeScoringSchema,
    temperature: 0.2,
  });
}

// 把 Agent 1 定性 + Agent 2 维度分 + 代码算的 baseScore 组装成 ResumeReview。
// Assemble ResumeReview from Agent 1 qualitative + Agent 2 dimensions + code-computed baseScore.
function assembleResumeReview(
  qualitative: ResumeQualitativeReview,
  scoring: ResumeReviewScoring,
  options: { screeningResult?: ResumeScreeningResult | null },
): ResumeReview {
  const baseScore = computeResumeReviewBaseScore(scoring.dimensions);
  return {
    biasScan: qualitative.biasScan,
    dimensions: scoring.dimensions,
    levelRecommendation: qualitative.levelRecommendation,
    nextStep: {
      ...qualitative.nextStep,
      action: constrainNextStepAction({
        action: qualitative.nextStep.action,
        screening: options.screeningResult,
      }),
    },
    overall: {
      baseScore,
      conclusion: qualitative.overall.conclusion,
      scoreRationale: `基于六维度按 ${formatResumeReviewFrameworkWeights()} 加权得出基础分 ${baseScore}（不含历史面试加权）`,
    },
    schemaVersion: RESUME_REVIEW_SCHEMA_VERSION,
    strengths: qualitative.strengths,
    teamPositioning: qualitative.teamPositioning,
    weaknesses: qualitative.weaknesses,
  };
}

export interface ResumeReviewGenerationResult {
  review: string;
  structuredReview: ResumeReview;
}

export function composeResumeReviewResult(
  qualitative: ResumeQualitativeReview,
  scoringInput: unknown,
  options: { screeningResult?: ResumeScreeningResult | null } = {},
): ResumeReviewGenerationResult {
  const scoring = resumeScoringSchema.parse(scoringInput);
  const structuredReview = assembleResumeReview(qualitative, scoring, options);
  const review = formatResumeReviewMarkdown(structuredReview).trim().slice(0, 2000);
  return { review, structuredReview };
}

function composeResumeReviewFromMarkdown(
  reviewMarkdown: string,
  qualitative: ResumeQualitativeReview,
  scoringInput: unknown,
  options: { screeningResult?: ResumeScreeningResult | null } = {},
): ResumeReviewGenerationResult {
  const scoring = resumeScoringSchema.parse(scoringInput);
  const structuredReview = assembleResumeReview(qualitative, scoring, options);
  const review = reviewMarkdown.trim().slice(0, 2000);
  return { review, structuredReview };
}

/**
 * Stage 3: stream a resume review via the three-agent pipeline.
 *
 * Agent 0 (hard filter) runs first; if violations are found, a reject review
 * is emitted immediately and Agent 1/2 are skipped. Otherwise Agent 1
 * (qualitative), Agent 2 (scoring), and composition steps are streamed through
 * the Mastra workflow event bridge.
 */
export function streamGenerateResumeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
}): ReadableStream<Uint8Array> {
  const runId = crypto.randomUUID();
  return createAiRunEventStream({
    run: async (emit) => {
      const { streamResumeReviewWorkflow } =
        await import("@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-review-workflow");
      return streamResumeReviewWorkflow(input, {
        onWorkflowEvent: (event) =>
          emitResumeReviewWorkflowEvent(event, (draft) => {
            emit({ ...draft, runId: draft.runId ?? runId } as AiRunEvent);
          }),
      });
    },
    runId,
    title: "生成简历评价",
    workflowId: "resume-review-workflow",
  });
}

export function streamGenerateResumeReviewMarkdownFirst(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
}): ReadableStream<Uint8Array> {
  const runId = crypto.randomUUID();
  const workflowId = "resume-review-markdown-first-workflow";
  return createAiRunEventStream({
    run: async (emit) => {
      let review = "";
      emit({
        label: "生成评价文本",
        runId,
        stepId: "markdown-review",
        type: "step.started",
      });
      const textStream = await generateResumeReviewMarkdown(input);
      for await (const chunk of textStream) {
        if (!chunk) {
          continue;
        }
        review += chunk;
        emit({
          runId,
          stepId: "markdown-review",
          text: chunk,
          type: "step.delta",
        });
      }
      review = review.trim().slice(0, 2000);
      if (!review) {
        throw new Error("简历评价文本生成失败。");
      }
      emit({
        output: { review },
        runId,
        stepId: "markdown-review",
        type: "step.completed",
      });

      emit({
        label: "结构化评价文本",
        runId,
        stepId: "qualitative-review",
        type: "step.started",
      });
      const qualitative = await generateResumeQualitativeReviewFromMarkdown({
        jobDescription: input.jobDescription,
        resumeProfile: input.resumeProfile,
        reviewMarkdown: review,
        screeningResult: input.screeningResult,
      });
      emit({
        output: { qualitative },
        runId,
        stepId: "qualitative-review",
        type: "step.completed",
      });

      emit({
        label: "生成维度评分",
        runId,
        stepId: "scoring",
        type: "step.started",
      });
      const scoring = await generateResumeReviewScoring({
        jobDescription: input.jobDescription,
        qualitative,
        resumeProfile: input.resumeProfile,
        reviewMarkdown: review,
        screeningResult: input.screeningResult,
      });
      emit({
        artifactType: "resume.review.scoring",
        data: {
          baseScore: computeResumeReviewBaseScore(scoring.dimensions),
          dimensions: scoring.dimensions,
        },
        runId,
        stepId: "scoring",
        type: "step.preview",
      });
      emit({
        output: { scoring },
        runId,
        stepId: "scoring",
        type: "step.completed",
      });

      const result = composeResumeReviewFromMarkdown(review, qualitative, scoring, {
        screeningResult: input.screeningResult,
      });
      emit({
        artifactType: "resume.review.result",
        data: result,
        runId,
        stepId: "scoring",
        type: "step.preview",
      });
      return result;
    },
    runId,
    title: "生成简历评价",
    workflowId,
  });
}

export async function generateResumeReview(input: {
  resumeProfile: ResumeProfile;
  jobDescription?: string | null;
  screeningResult?: ResumeScreeningResult | null;
}): Promise<ResumeReviewGenerationResult> {
  const { runResumeReviewWorkflow } =
    await import("@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-review-workflow");
  return runResumeReviewWorkflow(input);
}

/**
 * Combined: parse profile + generate questions in one blocking call.
 * Used by endpoints that need the full result at once (create/edit interview
 * fallback path when the client hasn't pre-parsed the resume).
 */
