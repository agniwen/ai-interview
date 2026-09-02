import {
  generateStructuredWithMastraAgent,
  humanInterviewEvaluationAgent,
} from "@app/ai-runtime/simple-generators";
import type { MastraGeneratorLike } from "@app/ai-runtime/simple-generators";
import { humanInterviewEvaluationSchema } from "@arc/db-schema/studio-interviews";
import type { HumanInterviewEvaluation } from "@arc/db-schema/studio-interviews";
import {
  normalizeHumanInterviewEvaluationText,
  normalizeHumanInterviewProfessionalSkill,
} from "@arc/shared/human-interview-evaluation";

interface EvaluationTurn {
  id: string;
  speakerDisplayName: string | null;
  speakerKey: string;
  text: string;
}

function normalizeGeneratedEvaluation(
  evaluation: HumanInterviewEvaluation,
): HumanInterviewEvaluation {
  return {
    ...evaluation,
    detailedAnalysis: normalizeHumanInterviewEvaluationText(evaluation.detailedAnalysis),
    overallEvaluation: normalizeHumanInterviewEvaluationText(evaluation.overallEvaluation),
    professionalSkill: normalizeHumanInterviewProfessionalSkill(evaluation.professionalSkill),
    risks: normalizeHumanInterviewEvaluationText(evaluation.risks),
    rolePosition: normalizeHumanInterviewEvaluationText(evaluation.rolePosition),
    salaryRecommendation: "-",
    seniorityPosition: normalizeHumanInterviewEvaluationText(evaluation.seniorityPosition),
    strengths: normalizeHumanInterviewEvaluationText(evaluation.strengths),
  };
}

export async function generateHumanInterviewEvaluation(
  input: {
    candidateName: string;
    jobDescription: string;
    resume: string;
    salaryRange: null;
    turns: EvaluationTurn[];
  },
  agent: MastraGeneratorLike = humanInterviewEvaluationAgent,
): Promise<HumanInterviewEvaluation> {
  const serializedTurns = JSON.stringify(input.turns);
  const maxTranscriptChars = Number(
    process.env.HUMAN_INTERVIEW_EVALUATION_MAX_TRANSCRIPT_CHARS ?? 500_000,
  );
  if (!Number.isSafeInteger(maxTranscriptChars) || maxTranscriptChars < 1) {
    throw new Error("HUMAN_INTERVIEW_EVALUATION_MAX_TRANSCRIPT_CHARS 配置无效");
  }
  if (serializedTurns.length > maxTranscriptChars) {
    throw new Error("真人复面完整转录超出 AI 评价上下文预算，未进行截断评价");
  }
  const evidenceTurnIds = new Set(
    input.turns
      .filter((turn) => {
        const displayName = turn.speakerDisplayName?.trim();
        return displayName === input.candidateName || displayName?.startsWith("候选人") === true;
      })
      .map((turn) => turn.id),
  );
  if (evidenceTurnIds.size === 0) {
    throw new Error("真人复面转录尚未可靠识别候选人发言，不能生成 AI 评价");
  }
  const evaluation = await generateStructuredWithMastraAgent({
    agent,
    maxOutputTokens: 12_000,
    observabilityLabel: "human-interview-evaluation",
    prompt: `请为真人复面生成一份供面试官复核和修改的完整评价草稿。

评级采用 S/A/B/C，参考 OKR 定性分档：
- S：显著超出岗位要求，能够承担关键影响范围；
- A：充分满足岗位要求，并有明确超出项；
- B：基本满足岗位要求，但存在需要确认或补足的差距；
- C：存在与核心岗位要求直接冲突或明显不足的证据。

硬性约束：
- 必须分析输入中的全部对话，不得只写摘要；detailedAnalysis 要覆盖主要问题、候选人回答、事实证据、相互印证和矛盾或不确定项；
- 只有 speakerDisplayName 明确为候选人姓名或以“候选人”开头的发言才是候选人证据；匿名 speakerKey 或 remote track 不代表候选人身份，问答位置或上下文推断也不能证明候选人身份；
- 无法可靠归属给候选人的内容不得作为评价证据，也不得把面试官的问题、提示或陈述当作候选人能力；归属不明时必须写入不确定项；
- 所有判断只允许来自输入的岗位 JD、简历和转录，不得臆测；
- evidenceTurnIds 只能逐字使用转录 JSON 中的 id；
- SABC 评级不得自动映射为通过、待定或不通过；
- 不输出 0–100 数字评分；
- professionalSkill 只能填写：优、良、中、差或 -；只给简短等级，不得附带原因、证据或详细描述；
- 当前岗位没有结构化薪资范围，salaryRecommendation 必须填写 -；该字段仍会在页面显示并允许人工填写；
- 无法判断或没有内容的字段统一填写 -，不得留空，不得用“信息不足”“无法判断”等句子替代；
- seniorityPosition、rolePosition、strengths、risks、overallEvaluation 和 detailedAnalysis 都必须返回字符串；有可靠内容时正常填写，不得编造。

候选人：${input.candidateName}

岗位 JD：
${input.jobDescription || "未提供"}

候选人简历：
${input.resume || "未提供"}

完整转录 JSON：
${serializedTurns}`,
    retryOnInvalid: true,
    schema: humanInterviewEvaluationSchema,
    temperature: 0.1,
    timeoutMs: 5 * 60 * 1000,
    validate: (generatedEvaluation) => {
      if (generatedEvaluation.evidenceTurnIds.some((turnId) => !evidenceTurnIds.has(turnId))) {
        throw new Error("真人复面 AI 评价引用了未可靠归属给候选人的证据");
      }
    },
  });
  return normalizeGeneratedEvaluation(evaluation);
}
