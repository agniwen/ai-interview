import type { StopCondition, ToolSet } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
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
}

export function createResumeAgent<TOOLS extends ToolSet>({
  instructions,
  tools,
  modelId = process.env.ALIBABA_MODEL ?? "qwen3.6-plus",
  enableThinking = true,
  stopWhen = stepCountIs(1),
  temperature,
  maxRetries = DEFAULT_STEP_MAX_RETRIES,
}: CreateResumeAgentOptions<TOOLS>) {
  const provider = createAlibabaProvider({ enableThinking });

  return new ToolLoopAgent({
    instructions,
    maxRetries,
    model: provider(modelId),
    stopWhen,
    temperature,
    tools,
  });
}
