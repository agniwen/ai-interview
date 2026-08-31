import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION,
  qualitativeResumeEvaluationV2Schema,
} from "@arc/db-schema/qualitative-resume-evaluation";
import type { QualitativeResumeEvaluationV2 } from "@arc/db-schema/qualitative-resume-evaluation";
import {
  generateStructuredWithMastraAgent,
  resumeReviewQualitativeAgent,
} from "@app/server/server/agents/mastra/agents/simple-generators";

export const QUALITATIVE_RESUME_PROMPT_VERSION = "qualitative-resume-v7";

const generatedQualitativeResumeEvaluationSchema = qualitativeResumeEvaluationV2Schema
  .omit({ schemaVersion: true })
  .extend({
    seniorityRecommendation:
      qualitativeResumeEvaluationV2Schema.shape.seniorityRecommendation.optional(),
    teamPositioning: qualitativeResumeEvaluationV2Schema.shape.teamPositioning.optional(),
  })
  .strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// oxlint-disable anti-slop/no-known-value-widening, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- Mastra's normalizeInvalid boundary receives untrusted provider output; the generated schema parses this normalized value immediately afterward.
export function normalizeGeneratedQualitativeResumeEvaluation(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const { schemaVersion: _modelOwnedSchemaVersion, ...candidate } = value;
  const seniorityRecommendation =
    qualitativeResumeEvaluationV2Schema.shape.seniorityRecommendation.safeParse(
      candidate.seniorityRecommendation,
    );
  const teamPositioning = qualitativeResumeEvaluationV2Schema.shape.teamPositioning.safeParse(
    candidate.teamPositioning,
  );

  return {
    ...candidate,
    seniorityRecommendation: seniorityRecommendation.success ? seniorityRecommendation.data : null,
    teamPositioning: teamPositioning.success ? teamPositioning.data : null,
  };
}
// oxlint-enable anti-slop/no-known-value-widening, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns

export interface QualitativeResumeEvaluationInput {
  evaluationAsOf: string;
  jobDescriptionName: string;
  jobDescriptionPrompt: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}

type QualitativeGenerator = typeof generateStructuredWithMastraAgent;

export function buildQualitativeResumeEvaluationPrompt(
  input: QualitativeResumeEvaluationInput,
): string {
  return `你正在执行候选人简历的六维定性评价。只可使用下面给出的岗位 JD 快照和候选人简历事实，不得引用旧评分配置、硬性规则、权重或任何外部资料。

评价日期：${input.evaluationAsOf}
岗位名称：${input.jobDescriptionName}

岗位 JD 快照：
${input.jobDescriptionPrompt}

候选人结构化简历：
${JSON.stringify(input.resumeProfile)}

候选人简历原文（可能为空）：
${input.resumeText ?? "未提供"}

输出要求：
1. 综合评价和六个维度都使用四档等级，依次为不推荐、待定、推荐、非常推荐，对应 not_recommended、undecided、recommended、highly_recommended。recommendationLevel 是综合等级；每个 dimensions.*.level 是该维度自己的等级，必须独立依据该维度证据判断，不得机械复制综合等级。
2. 综合或任一维度使用“不推荐”，都必须有岗位 JD 核心要求与简历明确事实之间的直接冲突。证据缺失、模糊或矛盾时使用“待定”，不得把猜测写成事实。
3. 六个维度均输出 level 和高信息密度 evaluation 文本，每项 2–4 句。优先引用简历中的公司、角色、项目、职责、成果、技能和时间等具体事实，并明确这些事实如何符合或不符合岗位要求。
4. 每个维度标注 basis：job 表示只依据岗位要求；general 表示岗位 JD 未提出要求，只能使用审慎的普适职业标准；both 表示两者兼有。普适职业标准不能单独导致“不推荐”，不得对学历、空档期、流动性或个人背景作未经岗位要求支持的偏见判断。
5. conciseOverall 为 1–2 句、约 50–100 个中文字符的短结论。detailedOverall 必须分别给出判断、匹配证据和风险/待确认点。其中 detailedOverall.judgment 是完整的长结论，目标为 200–300 个中文字符；必须讲清推荐等级的判断依据，引用候选人的具体经历、项目、职责、技能或量化成果，并说明这些证据如何符合或不符合岗位 JD、如何支持综合判断。不得只复述 conciseOverall、只写推荐等级或使用没有候选人事实支撑的通用表述。
6. 六个维度是 skillMatch（技能匹配）、experienceRelevance（经验相关性）、projectMatch（项目匹配）、educationBackground（教育/背景）、potential（潜力）、stability（稳定性）。只输出四档 level，不要输出任何数值分数、权重或条件命中列表；前端会直接依据 level 绘制定性雷达图。
7. 只有简历事实足以支持时才给 seniorityRecommendation 和 teamPositioning，否则返回 null，不得省略字段。seniorityRecommendation 只能是 null 或 {"level":"职级建议","rationale":"依据"}；teamPositioning 只能是 null 或 {"suggestion":"团队定位建议","rationale":"依据"}。
8. detailedOverall.judgment、detailedOverall.matchingEvidence、detailedOverall.risks、六个 dimensions.*.evaluation，以及可选建议中的 rationale 使用受限 Markdown。仅允许粗体、斜体和有序列表；需要强调关键要求或差距时可使用 **粗体**。列点时只允许使用有序列表，依实际条目数量按 1、2、3、4……连续编号，不得使用无序列表；其中 risks 有多个风险点时必须使用有序列表。每个列表项必须独占一行，编号后保留一个空格；列表示例必须输出为以下实际换行格式，不要把多个编号写在同一行：
1. 第一项
2. 第二项
3. 第三项
4. 第四项
不得使用 Markdown 标题、链接、图片、表格、代码、引用、分隔线、任务列表或 HTML。conciseOverall、level 和 suggestion 保持纯文本。`;
}

export async function generateQualitativeResumeEvaluation(
  input: QualitativeResumeEvaluationInput,
  generate: QualitativeGenerator = generateStructuredWithMastraAgent,
): Promise<QualitativeResumeEvaluationV2> {
  const generated = await generate({
    agent: resumeReviewQualitativeAgent,
    fallbackToTextGeneration: true,
    maxOutputTokens: 8192,
    normalizeInvalid: normalizeGeneratedQualitativeResumeEvaluation,
    observabilityLabel: QUALITATIVE_RESUME_PROMPT_VERSION,
    prompt: buildQualitativeResumeEvaluationPrompt(input),
    retryOnInvalid: true,
    retryOnTransient: true,
    retryTextJsonOnInvalid: true,
    schema: generatedQualitativeResumeEvaluationSchema,
    temperature: 0,
    timeoutMs: 120_000,
  });

  return qualitativeResumeEvaluationV2Schema.parse({
    ...generated,
    schemaVersion: QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION,
    seniorityRecommendation: generated.seniorityRecommendation ?? null,
    teamPositioning: generated.teamPositioning ?? null,
  });
}
