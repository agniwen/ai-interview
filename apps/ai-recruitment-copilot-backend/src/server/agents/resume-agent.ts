import type { PrepareStepFunction, StopCondition, ToolLoopAgentSettings, ToolSet } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import { withDevTools } from "./devtools";
import { createAlibabaProvider } from "./provider";

/**
 * How many times the AI SDK retries a transient LLM call failure (429, 5xx,
 * network blip, provider timeout) before bubbling the error up to the client.
 * Retries only apply before the stream starts emitting tokens — once the
 * response body is flowing, failures cannot be replayed.
 */
const DEFAULT_STEP_MAX_RETRIES = 3;

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
  modelId = getRequiredEnv("ALIBABA_MODEL"),
  enableThinking = true,
  stopWhen = stepCountIs(1),
  temperature,
  maxRetries = DEFAULT_STEP_MAX_RETRIES,
  maxOutputTokens,
  prepareStep,
}: CreateResumeAgentOptions<TOOLS>) {
  const provider = createAlibabaProvider({ enableThinking });

  const settings = {
    instructions,
    maxOutputTokens,
    maxRetries,
    model: withDevTools(provider(modelId)),
    prepareStep,
    stopWhen,
    temperature,
    tools,
  } as unknown as ToolLoopAgentSettings<never, TOOLS>;

  return new ToolLoopAgent<never, TOOLS>(settings);
}
