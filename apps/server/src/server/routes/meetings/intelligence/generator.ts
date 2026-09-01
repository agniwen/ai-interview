import {
  generateStructuredWithMastraAgent,
  meetingIntelligenceAgent,
  meetingIntelligenceDecisionPolicyAgent,
  StructuredOutputValidationError,
} from "@app/ai-runtime/simple-generators";
import type { MastraGeneratorLike } from "@app/ai-runtime/simple-generators";
import { getMastraModelIdentifier, mastraModels } from "@app/ai-runtime/models";
import {
  MEETING_INTELLIGENCE_GENERATION_PROGRESS_VERSION,
  MeetingIntelligenceTerminalError,
  createMeetingIntelligenceLeaseLostError,
  meetingIntelligencePayloadSchema,
  validateMeetingIntelligenceEvidence,
} from "@arc/shared/meeting-intelligence";
import type {
  MeetingIntelligenceGenerationProgress,
  MeetingIntelligencePayload,
  MeetingIntelligenceTemplate,
} from "@arc/shared/meeting-intelligence";
import { z } from "zod";

interface IntelligenceTranscriptTurn {
  endMs: number;
  id: string;
  speakerDisplayName: string | null;
  speakerKey: string;
  startMs: number;
  text: string;
}

export interface MeetingIntelligenceGeneratorSnapshot {
  model: string;
  provider: string;
}

interface MeetingIntelligenceGenerationRuntime {
  heartbeat?: () => Promise<boolean>;
  progress?: MeetingIntelligenceGenerationProgress | null;
  saveProgress?: (progress: MeetingIntelligenceGenerationProgress) => Promise<boolean>;
}

const DEFAULT_MAX_TRANSCRIPT_CHARS = 120_000;
const DEFAULT_MAX_REDUCE_CHARS = 100_000;

const decisionPolicyResultSchema = z
  .object({
    classification: z.enum(["allowed", "hiring-decision"]),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

const GENERAL_TEMPLATE_INSTRUCTIONS = `使用 General Meeting 模板：
- summary：准确、简洁的会议摘要；
- topics：主题与对应摘要；
- decisions：会议中明确作出的决定；
- actionItems：行动项、负责人和截止时间，未明确时填 null；
- openQuestions：仍待回答的问题。`;

const RECRUITING_TEMPLATE_INSTRUCTIONS = `使用 Recruiting Interview 模板：
- summary：面试内容摘要；
- candidateStatements：候选人或面试官陈述，明确 attribution，并区分 stated 与 needs-verification；
- keyExperience：与候选人经验有关的原文事实；
- verificationItems：仍需核验的信息；
- followUpActions：后续行动，未明确负责人或截止时间时填 null；
- 不得给出录用、淘汰、通过或不通过结论，也不得自动生成招聘决策。`;

function buildPrompt(input: {
  template: MeetingIntelligenceTemplate;
  turns: IntelligenceTranscriptTurn[];
}): string {
  const templateInstructions =
    input.template === "general" ? GENERAL_TEMPLATE_INSTRUCTIONS : RECRUITING_TEMPLATE_INSTRUCTIONS;
  return `请根据下面的会议转录生成版本化 Meeting Intelligence。

约束：
- 只能使用输入转录中的事实，不得补充常识、猜测或外部信息；
- 每一条 topic、decision、action item、open question、candidate statement、experience、verification item 或 follow-up action 都必须填写至少一个 evidenceTurnIds；
- evidenceTurnIds 只能逐字使用输入 JSON 中的 id；
- 没有证据的条目不要输出；
- 不得输出面试评分、受保护特征风险标签或任何候选人 pipeline 变更；
- 输出必须严格符合所选模板 ${input.template} 的结构。

${templateInstructions}

转录 JSON：
${JSON.stringify(input.turns)}`;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MeetingIntelligenceTerminalError(`${name} 配置无效`);
  }
  return value;
}

function serializedTurnsLength(turns: IntelligenceTranscriptTurn[]): number {
  let serializedChars = 2;
  for (const turn of turns) {
    serializedChars += JSON.stringify(turn).length + 1;
  }
  return serializedChars;
}

function fittingTurnTextPrefixLength(
  turn: IntelligenceTranscriptTurn,
  text: string,
  maxChars: number,
): number {
  let low = 1;
  let high = text.length;
  let fittingLength = 0;
  while (low <= high) {
    const candidateLength = Math.floor((low + high) / 2);
    const candidate = { ...turn, text: text.slice(0, candidateLength) };
    if (serializedTurnsLength([candidate]) <= maxChars) {
      fittingLength = candidateLength;
      low = candidateLength + 1;
    } else {
      high = candidateLength - 1;
    }
  }
  if (fittingLength < 1) {
    throw new MeetingIntelligenceTerminalError(
      "MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS 小于单个 turn 的最小序列化长度",
    );
  }
  return fittingLength;
}

function splitMeetingIntelligenceTurns(
  turns: IntelligenceTranscriptTurn[],
  maxChars: number,
): IntelligenceTranscriptTurn[][] {
  if (turns.length === 0) {
    return [[]];
  }
  const chunks: IntelligenceTranscriptTurn[][] = [];
  let current: IntelligenceTranscriptTurn[] = [];
  for (const turn of turns) {
    if (serializedTurnsLength([turn]) > maxChars) {
      if (current.length > 0) {
        chunks.push(current);
        current = [];
      }
      let offset = 0;
      while (offset < turn.text.length) {
        const remaining = turn.text.slice(offset);
        const textSliceLength = fittingTurnTextPrefixLength(turn, remaining, maxChars);
        chunks.push([{ ...turn, text: remaining.slice(0, textSliceLength) }]);
        offset += textSliceLength;
      }
      continue;
    }
    if (current.length > 0 && serializedTurnsLength([...current, turn]) > maxChars) {
      chunks.push(current);
      current = [];
    }
    current.push(turn);
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  if (chunks.some((chunk) => serializedTurnsLength(chunk) > maxChars)) {
    throw new MeetingIntelligenceTerminalError("Meeting Intelligence 分块超出上下文预算");
  }
  return chunks;
}

function buildReducePrompt(input: {
  partials: MeetingIntelligencePayload[];
  template: MeetingIntelligenceTemplate;
}): string {
  const templateInstructions =
    input.template === "general" ? GENERAL_TEMPLATE_INSTRUCTIONS : RECRUITING_TEMPLATE_INSTRUCTIONS;
  return `请把同一会议按时间分块生成的 Meeting Intelligence 合并成一个最终版本。

约束：
- 只能合并输入分块中的事实，不得新增事实或 evidenceTurnIds；
- 去除重复条目，保留所有互不重复的重要主题、决定、行动、问题或招聘事实；
- 每一条结构化条目必须保留至少一个原始 evidenceTurnIds；
- 不得输出面试评分、招聘决定、受保护特征风险标签或候选人 pipeline 变更；
- 输出必须严格符合模板 ${input.template}。

${templateInstructions}

分块 Intelligence JSON：
${JSON.stringify(input.partials)}`;
}

async function generatePayload(input: {
  agent: MastraGeneratorLike;
  evidenceTurnIds: ReadonlySet<string>;
  heartbeat?: () => Promise<boolean>;
  maxOutputTokens: number;
  prompt: string;
  template: MeetingIntelligenceTemplate;
}): Promise<MeetingIntelligencePayload> {
  if (input.heartbeat && !(await input.heartbeat())) {
    throw createMeetingIntelligenceLeaseLostError();
  }
  return await generateStructuredWithMastraAgent({
    agent: input.agent,
    maxOutputTokens: input.maxOutputTokens,
    prompt: input.prompt,
    retryOnInvalid: true,
    schema: meetingIntelligencePayloadSchema,
    temperature: 0.1,
    timeoutMs: 5 * 60 * 1000,
    validate: (value) => {
      if (value.template !== input.template) {
        throw new Error("Meeting Intelligence template 与请求不一致");
      }
      if (!validateMeetingIntelligenceEvidence(value, input.evidenceTurnIds)) {
        throw new Error("Meeting Intelligence evidence 不属于输入转录版本");
      }
    },
  });
}

function payloadEvidenceTurnIds(payload: MeetingIntelligencePayload): Set<string> {
  const items =
    payload.template === "general"
      ? [...payload.topics, ...payload.decisions, ...payload.actionItems, ...payload.openQuestions]
      : [
          ...payload.candidateStatements,
          ...payload.keyExperience,
          ...payload.verificationItems,
          ...payload.followUpActions,
        ];
  return new Set(items.flatMap((item) => item.evidenceTurnIds));
}

function groupEvidenceTurnIds(group: MeetingIntelligencePayload[]): Set<string> {
  return new Set(group.flatMap((payload) => [...payloadEvidenceTurnIds(payload)]));
}

async function persistProgress(
  runtime: MeetingIntelligenceGenerationRuntime,
  progress: MeetingIntelligenceGenerationProgress,
): Promise<void> {
  if (runtime.saveProgress && !(await runtime.saveProgress(progress))) {
    throw createMeetingIntelligenceLeaseLostError();
  }
}

function groupPartials(
  partials: MeetingIntelligencePayload[],
  maxChars: number,
): MeetingIntelligencePayload[][] {
  const groups: MeetingIntelligencePayload[][] = [];
  let current: MeetingIntelligencePayload[] = [];
  let currentChars = 2;
  for (const partial of partials) {
    const partialChars = JSON.stringify(partial).length + 1;
    if (current.length > 0 && currentChars + partialChars > maxChars) {
      groups.push(current);
      current = [];
      currentChars = 2;
    }
    if (partialChars > maxChars) {
      throw new MeetingIntelligenceTerminalError("Meeting Intelligence 分块结果超出归并预算");
    }
    current.push(partial);
    currentChars += partialChars;
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

async function reducePayloads(input: {
  agent: MastraGeneratorLike;
  maxChars: number;
  progress: Extract<MeetingIntelligenceGenerationProgress, { phase: "reduce" }>;
  runtime: MeetingIntelligenceGenerationRuntime;
  template: MeetingIntelligenceTemplate;
}): Promise<MeetingIntelligencePayload> {
  let { source } = input.progress;
  let completed = [...input.progress.completed];
  while (source.length > 1) {
    const groups = groupPartials(source, input.maxChars);
    if (groups.every((group) => group.length === 1)) {
      throw new MeetingIntelligenceTerminalError(
        "Meeting Intelligence 分块结果无法在上下文预算内归并",
      );
    }
    if (completed.length > groups.length) {
      throw new MeetingIntelligenceTerminalError("Meeting Intelligence 归并进度无效");
    }
    for (let index = 0; index < completed.length; index += 1) {
      const existing = completed[index];
      const group = groups[index];
      if (
        !existing ||
        !group ||
        existing.template !== input.template ||
        !validateMeetingIntelligenceEvidence(existing, groupEvidenceTurnIds(group))
      ) {
        throw new MeetingIntelligenceTerminalError("Meeting Intelligence 归并进度证据无效");
      }
    }
    for (let index = completed.length; index < groups.length; index += 1) {
      const group = groups[index];
      if (!group) {
        throw new MeetingIntelligenceTerminalError("Meeting Intelligence 归并分组不存在");
      }
      const [single] = group;
      const output =
        group.length === 1 && single
          ? single
          : await generatePayload({
              agent: input.agent,
              evidenceTurnIds: groupEvidenceTurnIds(group),
              heartbeat: input.runtime.heartbeat,
              maxOutputTokens: 6000,
              prompt: buildReducePrompt({ partials: group, template: input.template }),
              template: input.template,
            });
      completed.push(output);
      await persistProgress(input.runtime, {
        ...input.progress,
        completed,
        source,
      });
    }
    if (completed.length === 1) {
      break;
    }
    source = completed;
    completed = [];
    await persistProgress(input.runtime, {
      ...input.progress,
      completed,
      source,
    });
  }
  const [content] = completed.length === 1 ? completed : source;
  if (!content) {
    throw new MeetingIntelligenceTerminalError("Meeting Intelligence 没有可归并的结果");
  }
  return content;
}

async function assertRecruitingDecisionPolicy(
  content: MeetingIntelligencePayload,
  agent: MastraGeneratorLike,
  heartbeat?: () => Promise<boolean>,
): Promise<void> {
  if (content.template !== "recruiting-interview") {
    return;
  }
  if (heartbeat && !(await heartbeat())) {
    throw createMeetingIntelligenceLeaseLostError();
  }
  const decision = await generateStructuredWithMastraAgent({
    agent,
    maxOutputTokens: 500,
    prompt: `判断下面的 Recruiting Interview intelligence 是否包含系统对候选人的招聘决定或建议。

以下都必须分类为 hiring-decision：录用/拒绝/淘汰/通过/不通过；建议、推荐或决定推进候选人；move forward、advance、proceed、进入下一轮或下一阶段。仅复述候选人过去的事实或资格时分类为 allowed。

Intelligence JSON：
${JSON.stringify(content)}`,
    retryOnInvalid: true,
    schema: decisionPolicyResultSchema,
    temperature: 0,
    timeoutMs: 2 * 60 * 1000,
  });
  if (decision.classification === "hiring-decision") {
    throw new MeetingIntelligenceTerminalError(
      `Recruiting Interview intelligence 违反招聘决定政策：${decision.reason}`,
    );
  }
}

// eslint-disable-next-line complexity -- durable map/reduce resume states share one orchestrator.
export async function generateMeetingIntelligence(
  input: { template: MeetingIntelligenceTemplate; turns: IntelligenceTranscriptTurn[] },
  agent: MastraGeneratorLike = meetingIntelligenceAgent,
  decisionPolicyAgent: MastraGeneratorLike = meetingIntelligenceDecisionPolicyAgent,
  runtime: MeetingIntelligenceGenerationRuntime = {},
): Promise<MeetingIntelligencePayload> {
  const turnIds = new Set(input.turns.map((turn) => turn.id));
  try {
    const maxTranscriptChars =
      runtime.progress?.maxTranscriptChars ??
      readPositiveIntegerEnv(
        "MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS",
        DEFAULT_MAX_TRANSCRIPT_CHARS,
      );
    const maxReduceChars =
      runtime.progress?.maxReduceChars ??
      readPositiveIntegerEnv("MEETING_INTELLIGENCE_MAX_REDUCE_CHARS", DEFAULT_MAX_REDUCE_CHARS);
    const chunks = splitMeetingIntelligenceTurns(input.turns, maxTranscriptChars);
    let progress: MeetingIntelligenceGenerationProgress = runtime.progress ?? {
      completed: [],
      kind: "progress",
      maxReduceChars,
      maxTranscriptChars,
      phase: "map",
      version: MEETING_INTELLIGENCE_GENERATION_PROGRESS_VERSION,
    };
    if (
      progress.phase === "reduce" &&
      progress.source.some(
        (content) =>
          content.template !== input.template ||
          !validateMeetingIntelligenceEvidence(content, turnIds),
      )
    ) {
      throw new MeetingIntelligenceTerminalError("Meeting Intelligence 归并来源证据无效");
    }
    if (progress.phase === "map") {
      if (progress.completed.length > chunks.length) {
        throw new MeetingIntelligenceTerminalError("Meeting Intelligence 分块进度无效");
      }
      for (let index = 0; index < progress.completed.length; index += 1) {
        const content = progress.completed[index];
        const turns = chunks[index];
        if (
          !content ||
          !turns ||
          content.template !== input.template ||
          !validateMeetingIntelligenceEvidence(content, new Set(turns.map((turn) => turn.id)))
        ) {
          throw new MeetingIntelligenceTerminalError("Meeting Intelligence 分块进度证据无效");
        }
      }
      await persistProgress(runtime, progress);
      for (let index = progress.completed.length; index < chunks.length; index += 1) {
        const turns = chunks[index];
        if (!turns) {
          throw new MeetingIntelligenceTerminalError("Meeting Intelligence 分块不存在");
        }
        const content = await generatePayload({
          agent,
          evidenceTurnIds: new Set(turns.map((turn) => turn.id)),
          heartbeat: runtime.heartbeat,
          maxOutputTokens: chunks.length === 1 ? 12_000 : 4000,
          prompt: buildPrompt({ template: input.template, turns }),
          template: input.template,
        });
        // oxlint-disable-next-line no-accumulating-spread -- each persisted stage needs an immutable snapshot.
        const completed: MeetingIntelligencePayload[] = [...progress.completed, content];
        progress = {
          completed,
          kind: "progress",
          maxReduceChars: progress.maxReduceChars,
          maxTranscriptChars: progress.maxTranscriptChars,
          phase: "map",
          version: progress.version,
        };
        await persistProgress(runtime, progress);
      }
    }
    if (progress.phase === "map" && progress.completed.length > 1) {
      progress = {
        completed: [],
        kind: "progress",
        maxReduceChars,
        maxTranscriptChars,
        phase: "reduce",
        source: progress.completed,
        version: MEETING_INTELLIGENCE_GENERATION_PROGRESS_VERSION,
      };
      await persistProgress(runtime, progress);
    }
    const content =
      progress.phase === "map"
        ? progress.completed[0]
        : await reducePayloads({
            agent,
            maxChars: maxReduceChars,
            progress,
            runtime,
            template: input.template,
          });
    if (!content) {
      throw new MeetingIntelligenceTerminalError("Meeting Intelligence 没有生成结果");
    }
    if (!validateMeetingIntelligenceEvidence(content, turnIds)) {
      throw new MeetingIntelligenceTerminalError("Meeting Intelligence 最终证据不属于输入转录版本");
    }
    await assertRecruitingDecisionPolicy(content, decisionPolicyAgent, runtime.heartbeat);
    return content;
  } catch (error) {
    if (error instanceof MeetingIntelligenceTerminalError) {
      throw error;
    }
    if (error instanceof StructuredOutputValidationError) {
      throw new MeetingIntelligenceTerminalError(error.message);
    }
    throw error;
  }
}

export function getMeetingIntelligenceGeneratorSnapshot(): MeetingIntelligenceGeneratorSnapshot {
  const model = getMastraModelIdentifier(mastraModels.structuredModel);
  return { model, provider: model.split("/", 1)[0] || "unknown" };
}
