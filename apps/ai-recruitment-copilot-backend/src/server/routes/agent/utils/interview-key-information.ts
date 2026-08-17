import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewContextSnapshotJobDescription } from "@arc/db-schema/interview-snapshots";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { interviewKeyInformationSchema } from "@arc/db-schema/interview-key-information";
import type { InterviewKeyInformation } from "@arc/db-schema/interview-key-information";
import {
  generateStructuredWithMastraAgent,
  interviewKeyInformationAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import type { MastraGeneratorLike } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

const KEY_INFORMATION_PROMPT = `你是一位面试重点信息提取助手。请使用岗位上下文判断信息的重要性，但只能把候选人在本轮对话中明确表达的内容作为重点信息。

## 输出目标
- skillEvidence：最多 3 条关键技能证据。技能必须有实际使用场景、职责、解决的问题或结果支撑；只有技能名称或自我评价时不得收录。
- quantitativeInformation：最多 3 条有上下文的关键量化信息，包括业务结果、团队或系统规模、周期、金额、效率和质量指标。候选人明确表达新岗位薪资期望时必须收录，并占用 3 条限额中的一条。孤立数字不得收录。
- risks：最多 3 条。observed 只用于回答已经暴露的岗位相关矛盾、能力缺口或工作条件冲突；needs_verification 用于已谈到但信息不完整、缺少关键细节的事项。没有被提问或没有机会展示的内容不得视为风险。

## 强约束
- 不得输出推进建议、录用建议、总体评价或分数。
- 只能使用候选人发言；面试官话术、岗位描述和面试题只能用于理解与排序，不能作为候选人证据。
- 简历和面试前表单不属于本次输入，也不得推测其中内容。
- 年龄、婚育和家庭情况不得收录。薪资期望可以收录。
- 未核实陈述使用“候选人表示/自述”等归因措辞，不得包装成已验证事实。
- 同一事实只进入一个最合适的分类，不得重复。
- 每条信息必须包含 1-2 条候选人原话证据。quote 必须逐字来自候选人发言；能定位时填写 turnIndex 和 timeInCallSecs。
- 没有可靠信息的分类输出空数组，不得凑数。

## 岗位上下文
{jobContext}

## 面试题与考核点
{questions}

## 本轮面试对话
{transcript}`;

const EMPTY_KEY_INFORMATION: InterviewKeyInformation = {
  quantitativeInformation: [],
  risks: [],
  skillEvidence: [],
};

function formatJobContext(input: {
  jobDescription: InterviewContextSnapshotJobDescription | null;
  targetRole: string | null;
}): string {
  const { jobDescription, targetRole } = input;
  if (!(targetRole || jobDescription)) {
    return "（无岗位上下文）";
  }
  return [
    targetRole ? `目标岗位：${targetRole}` : null,
    jobDescription?.name ? `岗位名称：${jobDescription.name}` : null,
    jobDescription?.description ? `岗位描述：${jobDescription.description}` : null,
    jobDescription?.prompt ? `岗位考察要求：${jobDescription.prompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatQuestions(questions: InterviewQuestion[]): string {
  if (questions.length === 0) {
    return "（无面试题上下文）";
  }
  return questions
    .map((question) => {
      const focus = question.evaluationFocus ? `；考核点：${question.evaluationFocus}` : "";
      return `${question.order}. ${question.question}${focus}`;
    })
    .join("\n");
}

function formatTranscript(transcript: InterviewTranscriptTurn[]): string {
  return transcript
    .map((turn, index) => {
      const role = turn.role === "user" ? "候选人" : "面试官";
      const time =
        turn.timeInCallSecs === undefined ? "" : ` time=${Math.round(turn.timeInCallSecs)}s`;
      return `[turnIndex=${index + 1}${time}] ${role}: ${turn.message}`;
    })
    .join("\n");
}

export interface InterviewKeyInformationDependencies {
  agent: MastraGeneratorLike;
  generate: typeof generateStructuredWithMastraAgent;
}

const defaultInterviewKeyInformationDependencies: InterviewKeyInformationDependencies = {
  agent: interviewKeyInformationAgent,
  generate: generateStructuredWithMastraAgent,
};

export async function generateInterviewKeyInformation(
  options: {
    jobDescription: InterviewContextSnapshotJobDescription | null;
    questions: InterviewQuestion[];
    targetRole: string | null;
    transcript: InterviewTranscriptTurn[];
  },
  dependencies: InterviewKeyInformationDependencies = defaultInterviewKeyInformationDependencies,
): Promise<InterviewKeyInformation> {
  if (options.transcript.length === 0) {
    return EMPTY_KEY_INFORMATION;
  }

  return await dependencies.generate({
    agent: dependencies.agent,
    prompt: KEY_INFORMATION_PROMPT.replace("{jobContext}", formatJobContext(options))
      .replace("{questions}", formatQuestions(options.questions))
      .replace("{transcript}", formatTranscript(options.transcript)),
    schema: interviewKeyInformationSchema,
    temperature: 0,
  });
}
