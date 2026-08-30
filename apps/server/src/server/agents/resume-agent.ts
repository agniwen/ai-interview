import type {
  PrepareStepFunction,
  StopCondition,
  ToolLoopAgentSettings,
  ToolSet,
  Output,
} from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getRequiredEnv } from "@app/server/lib/server/env";
import { createAlibabaProvider } from "./provider";

/**
 * How many times the AI SDK retries a transient LLM call failure (429, 5xx,
 * network blip, provider timeout) before bubbling the error up to the client.
 * Retries only apply before the stream starts emitting tokens — once the
 * response body is flowing, failures cannot be replayed.
 */
const DEFAULT_STEP_MAX_RETRIES = 3;
type AgentOutputSpec<T> = ReturnType<typeof Output.object<T>>;

export interface CreateResumeAgentOptions<TOOLS extends ToolSet, OUTPUT = string> {
  instructions: string;
  tools?: TOOLS;
  modelId?: string;
  stopWhen?: StopCondition<TOOLS> | StopCondition<TOOLS>[];
  temperature?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  prepareStep?: PrepareStepFunction<TOOLS>;
  output?: AgentOutputSpec<OUTPUT>;
}

export function createResumeAgent<TOOLS extends ToolSet, OUTPUT = string>({
  instructions,
  tools,
  modelId = getRequiredEnv("ALIBABA_MODEL"),
  stopWhen = stepCountIs(1),
  temperature,
  maxRetries = DEFAULT_STEP_MAX_RETRIES,
  maxOutputTokens,
  prepareStep,
  output,
}: CreateResumeAgentOptions<TOOLS, OUTPUT>) {
  const provider = createAlibabaProvider();

  const settings = {
    instructions,
    maxOutputTokens,
    maxRetries,
    model: provider(modelId),
    output,
    prepareStep,
    stopWhen,
    temperature,
    tools,
  } satisfies ToolLoopAgentSettings<never, TOOLS, AgentOutputSpec<OUTPUT>>;

  return new ToolLoopAgent<never, TOOLS, AgentOutputSpec<OUTPUT>>(settings);
}
