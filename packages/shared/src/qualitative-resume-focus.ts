import { z } from "zod";

/**
 * 列表卡片评语下方的评价摘录：推荐 / 非常推荐取“匹配依据”，待定 / 不推荐取“风险与待确认项”。
 * V3 起为结构化要点（最多 4 条，每条带类型、要求点、结论、岗位要求、原文证据，供卡片 HoverCard 展示），
 * V1/V2 历史结果为截断的受限 Markdown。
 */
export const qualitativeResumeFocusSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("points"),
    items: z.array(
      z.object({
        content: z.string(),
        jobRequirement: z.string(),
        kind: z.enum(["matching", "risk"]),
        point: z.string(),
        resumeEvidence: z.string().nullable(),
      }),
    ),
  }),
  z.object({ format: z.literal("markdown"), text: z.string() }),
]);

export type QualitativeResumeFocus = z.infer<typeof qualitativeResumeFocusSchema>;
