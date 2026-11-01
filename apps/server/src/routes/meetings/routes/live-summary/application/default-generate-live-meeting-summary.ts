import {
  getMastraModelApiKey,
  getMastraModelIdentifier,
  mastraModels,
  usesTextJsonStructuredOutput,
} from "@app/ai-runtime/models";
import {
  generateStructuredWithMastraAgent,
  meetingSummaryAgent,
} from "@app/ai-runtime/simple-generators";
import { MEETING_LIVE_SUMMARY_MODEL_TIMEOUT_MS } from "@app/shared/meeting-live-summary";
import type { MeetingLiveSummaryRequest } from "@app/shared/meeting-live-summary";
import {
  generateLiveMeetingSummary,
  meetingLiveSummaryCandidateSchema,
} from "./generate-live-meeting-summary";

import { createSummaryCandidateCache } from "./summary-candidate-cache";

import { compactSummaryEvidence } from "./compact-summary-evidence";

const cachedCandidate = createSummaryCandidateCache();

function buildPrompt(request: MeetingLiveSummaryRequest): string {
  const previous = request.baseSnapshot
    ? {
        pendingThoughts: request.baseSnapshot.pendingThoughts ?? [],
        summary: request.baseSnapshot.summary,
        topicDirectory: request.baseSnapshot.topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
        })),
        topics: request.baseSnapshot.topics
          .filter((topic, index, topics) => topic.status === "active" || index >= topics.length - 2)
          .map((topic) => ({
            evidenceTurnIds: topic.evidenceTurnIds,
            id: topic.id,
            points: topic.points.map((point) => ({
              evidenceTurnIds: point.evidenceTurnIds,
              id: point.id,
              kind: point.kind,
              text: point.text,
            })),
            summary: topic.summary,
            title: topic.title,
          })),
      }
    : null;
  const templateInstructions =
    request.template === "recruiting-interview"
      ? `这是招聘面试。只整理候选人或面试官明确说出的事实、项目经历、能力、求职动机与待核实问题。
不得评分，不得给出录用、淘汰、通过、不通过或推进候选人的建议。`
      : `这是通用会议。整理明确讨论的主题、事实与仍待回答的问题，不要推测决定或行动。`;
  return `根据上一版实时总结和新增的稳定字幕，输出本轮新增或发生变化的主题；summary 仍为整体总结。

${templateInstructions}

规则：
- 只能使用输入中的内容，不得补充外部事实；
- 前段原文只用于衔接，已处理的事实不要重复新增；新增或修正观点至少引用一个本轮新增字幕；
- 片段边界不代表观点结束。条件、否定、转折、问答可能跨段；未说完的观点写入 pendingThoughts，不得作为确定事实；
- 根据本轮字幕补全上一版 pendingThoughts，只保留仍未完成的项；录音结束也不能替说话人补完条件；
- 后文明确纠正旧观点时，复用原 point id 更新；合并多个旧观点时用 replacesPointIds 列出本主题内被替换的旧 point id；
- 每个主题和子节点都必须引用 evidenceTurnIds，只选 1–3 个最有代表性的证据，不要枚举全部字幕；
- evidenceTurnIds 只能逐字使用上一版或新增字幕里出现的 turn id；
- 同一主题继续讨论时必须复用上一版 topic id；同一事实继续补充时复用上一版 point id；
- 新主题或新子节点使用 new-topic-1、new-point-1 这类本次请求内唯一的临时 id；
- topicDirectory 是完整历史目录；详细正文仅含近期主题。提及目录中的旧主题时复用其 id，无法确定旧观点细节时不要猜测或删除；
- 未变化的历史主题和子节点不需要重复输出，系统会自动保留；变化的主题只输出变化或新增的子节点；
- topics 至少输出一个本轮主题；activeTopicId 只指向本次输出中当前正在讨论的一个主题，无法判断时为 null；
- topic.summary 是该主题到目前为止的保守摘要，最多 200 字；整体 summary 最多 400 字，point.text 最多 150 字；
- point.kind=fact 只写明确陈述，point.kind=question 只写明确未解决或需要核实的问题；
- 控制规模：最多 12 个主题，每个主题最多 8 个子节点；合并重复内容；
- 必须完整输出所有必填字段和 JSON 闭合符号；不要为了列出更多证据省略 id、title、summary、points 或子节点字段；
- 输出严格符合 JSON schema，不要输出解释。

上一版实时总结：
${JSON.stringify(previous)}

前段原文（仅上下文）：
${JSON.stringify(request.contextTurns ?? [])}

新增稳定字幕：
${JSON.stringify(request.turns)}`;
}

export async function defaultGenerateLiveMeetingSummary(
  request: MeetingLiveSummaryRequest,
  cacheScope?: string,
) {
  if (!getMastraModelApiKey()) {
    throw new Error("实时总结模型尚未配置");
  }
  return await generateLiveMeetingSummary(request, {
    generateCandidate: async ({ request: current }) => {
      const compact = compactSummaryEvidence(current);
      const prompt = buildPrompt(compact.request);
      const generate = () =>
        generateStructuredWithMastraAgent({
          agent: meetingSummaryAgent,
          maxOutputTokens: 3000,
          observabilityLabel: "meeting-live-summary-v1",
          prompt,
          retryOnInvalid: true,
          retryOnTransient: true,
          schema: meetingLiveSummaryCandidateSchema,
          temperature: 0.1,
          textGenerationFirst: usesTextJsonStructuredOutput(mastraModels.fastModel),
          timeoutMs: MEETING_LIVE_SUMMARY_MODEL_TIMEOUT_MS,
        });
      const candidate = cacheScope
        ? await cachedCandidate(
            `${cacheScope}:${getMastraModelIdentifier(mastraModels.fastModel)}:summary-v2`,
            prompt,
            generate,
          )
        : await generate();
      return compact.restore(candidate);
    },
    getGeneratorSnapshot: () => ({
      model: getMastraModelIdentifier(mastraModels.fastModel),
      provider: "mastra",
    }),
    now: () => new Date(),
  });
}
