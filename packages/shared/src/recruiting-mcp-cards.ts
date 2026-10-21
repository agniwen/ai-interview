import { z } from "zod";

/**
 * 招聘 MCP Apps 卡片契约：MCP 工具的 `structuredContent` 与 `ui://` 视图共用同一份定义。
 * 文案标签由服务端解析好再下发，视图只负责展示，不依赖数据库枚举。
 *
 * Card contract shared by the recruiting MCP tools (`structuredContent`) and the
 * sandboxed MCP Apps view. Labels are resolved server-side so the view stays presentational.
 */
export const RECRUITING_MCP_CARDS_RESOURCE_URI = "ui://recruiting/cards.html";

const labeledValueSchema = z.object({ label: z.string(), value: z.string() });

const profileLineSchema = z.object({
  period: z.string().nullable(),
  primary: z.string(),
  secondary: z.string().nullable(),
});

export const mcpCandidateCardSchema = z.object({
  education: z.array(profileLineSchema),
  experience: z.array(profileLineSchema),
  id: z.string(),
  jobName: z.string().nullable(),
  name: z.string(),
  /** 已结束流程时的结论（录用 / 淘汰 / 撤回 / 冷藏）；进行中为 null。 */
  outcome: labeledValueSchema.nullable(),
  recommendation: labeledValueSchema.nullable(),
  skills: z.array(z.string()),
  stage: labeledValueSchema,
  summary: z.string().nullable(),
  targetRole: z.string().nullable(),
  updatedAt: z.string(),
  /** 工作台中的候选人详情页；无法生成链接时为 null。 */
  url: z.string().nullable(),
});

export const mcpCandidateListCardSchema = z.object({
  candidates: z.array(mcpCandidateCardSchema),
  kind: z.literal("candidate_list"),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const mcpCandidateDetailCardSchema = z.object({
  candidate: mcpCandidateCardSchema.extend({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    recruiterAssessment: z.string().nullable(),
    workYears: z.number().nullable(),
  }),
  kind: z.literal("candidate_detail"),
});

export const recruitingMcpCardSchema = z.discriminatedUnion("kind", [
  mcpCandidateListCardSchema,
  mcpCandidateDetailCardSchema,
]);

export type McpCandidateCard = z.infer<typeof mcpCandidateCardSchema>;
export type McpCandidateListCard = z.infer<typeof mcpCandidateListCardSchema>;
export type McpCandidateDetailCard = z.infer<typeof mcpCandidateDetailCardSchema>;
export type RecruitingMcpCard = z.infer<typeof recruitingMcpCardSchema>;
