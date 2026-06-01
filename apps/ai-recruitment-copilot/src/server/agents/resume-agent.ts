import type { PrepareStepFunction, StopCondition, ToolSet } from "ai";
import { stepCountIs } from "ai";
import { createMastraResumeScreeningAgent } from "@/server/mastra/agents";

export interface CreateResumeAgentOptions<TOOLS extends ToolSet> {
  instructions: string;
  tools?: TOOLS;
  modelId?: string;
  enableThinking?: boolean;
  stopWhen?: StopCondition<TOOLS> | StopCondition<TOOLS>[];
  temperature?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  prepareStep?: PrepareStepFunction<TOOLS>;
}

export function createResumeAgent<TOOLS extends ToolSet>({
  instructions,
  tools,
  modelId = process.env.ALIBABA_MODEL ?? "deepseek-v4-pro",
  enableThinking = true,
  stopWhen = stepCountIs(1),
  temperature,
  maxRetries,
  maxOutputTokens,
  prepareStep,
}: CreateResumeAgentOptions<TOOLS>) {
  return createMastraResumeScreeningAgent({
    enableThinking,
    instructions,
    maxOutputTokens,
    maxRetries,
    modelId,
    prepareStep,
    stopWhen,
    temperature,
    tools,
  });
}
