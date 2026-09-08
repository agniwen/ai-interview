import { z } from "zod";
import {
  generateStructuredWithMastraAgent,
  meetingSummaryAgent,
} from "@app/ai-runtime/simple-generators";
import { mastraModels, usesTextJsonStructuredOutput } from "@app/ai-runtime/models";
import { meetingIntelligencePayloadSchema } from "@app/shared/meeting-intelligence";
import type { MeetingIntelligencePayload } from "@app/shared/meeting-intelligence";

const planSchema = z.object({
  replacements: z
    .array(
      z.object({
        keep: z.string(),
        remove: z.array(z.string()).min(1),
      }),
    )
    .max(500),
  summary: z.string().min(1).max(4000),
});
type Plan = z.infer<typeof planSchema>;

function entries(partials: MeetingIntelligencePayload[]) {
  return partials.flatMap((partial, part) => {
    const groups: Record<string, { evidenceTurnIds: string[] }[]> =
      partial.template === "general"
        ? {
            actionItems: partial.actionItems,
            decisions: partial.decisions,
            openQuestions: partial.openQuestions,
            topics: partial.topics,
          }
        : {
            candidateStatements: partial.candidateStatements,
            followUpActions: partial.followUpActions,
            keyExperience: partial.keyExperience,
            verificationItems: partial.verificationItems,
          };
    return Object.entries(groups).flatMap(([field, values]) =>
      values.map((value, index) => ({
        field,
        id: `${part}:${field}:${index}`,
        part,
        value,
      })),
    );
  });
}

export function applyIntelligenceMergePlan(
  partials: MeetingIntelligencePayload[],
  plan: Plan,
): MeetingIntelligencePayload {
  const all = entries(partials);
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const removed = new Set<string>();
  const kept = new Set(plan.replacements.map((item) => item.keep));
  for (const replacement of plan.replacements) {
    const keep = byId.get(replacement.keep);
    if (!keep) {
      throw new Error("总结合并引用未知条目");
    }
    for (const id of replacement.remove) {
      const remove = byId.get(id);
      if (!remove || remove.field !== keep.field || remove.part > keep.part || kept.has(id)) {
        throw new Error("总结合并替换关系无效");
      }
      removed.add(id);
    }
  }
  const template = partials[0]?.template;
  if (!template || partials.some((partial) => partial.template !== template)) {
    throw new Error("总结合并模板不一致");
  }
  const fields =
    template === "general"
      ? ["topics", "decisions", "actionItems", "openQuestions"]
      : ["candidateStatements", "keyExperience", "verificationItems", "followUpActions"];
  return meetingIntelligencePayloadSchema.parse({
    summary: plan.summary,
    template,
    ...Object.fromEntries(
      fields.map((field) => [
        field,
        all
          .filter((entry) => entry.field === field && !removed.has(entry.id))
          .map((entry) => entry.value),
      ]),
    ),
  });
}

export async function compactReduceIntelligence(partials: MeetingIntelligencePayload[]) {
  const all = entries(partials);
  const prompt = `按时间顺序整理会议分段结果。只输出总览和条目替换关系，不要重写条目正文。
只能删除完全重复、或者被后文明确补全/纠正的同类旧条目；保留编号更晚且表达完整的条目为 keep，旧条目编号放 remove。不确定则不删除，未完条件保留为未明确。不得遗漏独立事实、猜测条件或作出招聘决策。
summary 不超过 500 字，replacements 没有则 []。严格返回以下 JSON Schema 对象：
${JSON.stringify(z.toJSONSchema(planSchema))}
分段总览：${JSON.stringify(partials.map((partial) => partial.summary))}
条目：${JSON.stringify(all.map(({ id, field, value }) => ({ ...value, evidenceTurnIds: undefined, field, id })))}`;
  const plan = await generateStructuredWithMastraAgent({
    agent: meetingSummaryAgent,
    maxOutputTokens: 2000,
    observabilityLabel: "meeting-intelligence-compact-merge",
    prompt,
    retryOnInvalid: true,
    schema: planSchema,
    temperature: 0.1,
    textGenerationFirst: usesTextJsonStructuredOutput(mastraModels.fastModel),
    timeoutMs: 75_000,
    validate: (value) => {
      applyIntelligenceMergePlan(partials, value);
    },
  });
  return applyIntelligenceMergePlan(partials, plan);
}
