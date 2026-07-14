import { z } from "zod";

export const agentDebugResourceParamsSchema = z.object({
  key: z.string().trim().min(1, "缺少资源标识。"),
});

export const agentDebugAgentRunSchema = z.object({
  prompt: z.string().trim().min(1, "请输入调试消息。").max(100_000, "调试消息过长。"),
});

export const agentDebugWorkflowRunSchema = z.object({
  input: z.unknown(),
});
