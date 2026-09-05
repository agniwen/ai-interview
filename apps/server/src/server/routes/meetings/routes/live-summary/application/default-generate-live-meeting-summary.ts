import {
  getMastraModelApiKey,
  getMastraModelIdentifier,
  mastraModels,
} from "@app/ai-runtime/models";
import {
  generateStructuredWithMastraAgent,
  meetingIntelligenceAgent,
} from "@app/ai-runtime/simple-generators";
import type { MeetingLiveSummaryRequest } from "@app/shared/meeting-live-summary";
import {
  generateLiveMeetingSummary,
  meetingLiveSummaryCandidateSchema,
} from "./generate-live-meeting-summary";

function buildPrompt(request: MeetingLiveSummaryRequest): string {
  const previous = request.baseSnapshot
    ? {
        summary: request.baseSnapshot.summary,
        topics: request.baseSnapshot.topics.map((topic) => ({
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
  return `根据上一版实时总结和新增的稳定字幕，输出更新后的完整主题树候选结果。

${templateInstructions}

规则：
- 只能使用输入中的内容，不得补充外部事实；
- 每个主题和子节点都必须引用至少一个 evidenceTurnIds；
- evidenceTurnIds 只能逐字使用上一版或新增字幕里出现的 turn id；
- 同一主题继续讨论时必须复用上一版 topic id；同一事实继续补充时复用上一版 point id；
- 新主题或新子节点使用 new-topic-1、new-point-1 这类本次请求内唯一的临时 id；
- 保留仍有价值的历史主题，不要因为本轮没有提到就删除；
- activeTopicId 只指向当前正在讨论的一个主题；无法判断时为 null；
- topic.summary 是该主题到目前为止的保守摘要；
- point.kind=fact 只写明确陈述，point.kind=question 只写明确未解决或需要核实的问题；
- 控制规模：最多 12 个主题，每个主题最多 8 个子节点；合并重复内容；
- 输出严格符合 JSON schema，不要输出解释。

上一版实时总结：
${JSON.stringify(previous)}

新增稳定字幕：
${JSON.stringify(request.turns)}`;
}

export async function defaultGenerateLiveMeetingSummary(request: MeetingLiveSummaryRequest) {
  if (!getMastraModelApiKey()) {
    throw new Error("实时总结模型尚未配置");
  }
  return await generateLiveMeetingSummary(request, {
    generateCandidate: async ({ request: current }) =>
      await generateStructuredWithMastraAgent({
        agent: meetingIntelligenceAgent,
        maxOutputTokens: 4096,
        observabilityLabel: "meeting-live-summary-v1",
        prompt: buildPrompt(current),
        retryOnInvalid: true,
        retryOnTransient: true,
        schema: meetingLiveSummaryCandidateSchema,
        temperature: 0.1,
        timeoutMs: 75_000,
      }),
    getGeneratorSnapshot: () => ({
      model: getMastraModelIdentifier(mastraModels.structuredModel),
      provider: "mastra",
    }),
    now: () => new Date(),
  });
}
