import type { ToolLoopAgentSettings, ToolSet, Output } from "ai";
import { isStepCount, ToolLoopAgent } from "ai";
import { getRequiredEnv } from "../../lib/server/env";
import { createAlibabaProvider } from "./provider";

/**
 * How many times the AI SDK retries a transient LLM call failure (429, 5xx,
 * network blip, provider timeout) before bubbling the error up to the client.
 * Retries only apply before the stream starts emitting tokens — once the
 * response body is flowing, failures cannot be replayed.
 */
const DEFAULT_STEP_MAX_RETRIES = 3;
type AgentOutputSpec<T> = ReturnType<typeof Output.object<T>>;
type AgentRuntimeContext = NonNullable<ToolLoopAgentSettings["runtimeContext"]>;

export type CreateResumeAgentOptions<TOOLS extends ToolSet, OUTPUT = string> = Pick<
  ToolLoopAgentSettings<never, TOOLS, AgentRuntimeContext, AgentOutputSpec<OUTPUT>>,
  | "instructions"
  | "tools"
  | "toolsContext"
  | "stopWhen"
  | "temperature"
  | "maxRetries"
  | "maxOutputTokens"
  | "prepareStep"
  | "output"
> & { instructions: string; modelId?: string };

export function createResumeAgent<TOOLS extends ToolSet, OUTPUT = string>({
  modelId = getRequiredEnv("ALIBABA_MODEL"),
  stopWhen = isStepCount(1),
  maxRetries = DEFAULT_STEP_MAX_RETRIES,
  ...options
}: CreateResumeAgentOptions<TOOLS, OUTPUT>) {
  const provider = createAlibabaProvider();

  const settings = {
    ...options,
    maxRetries,
    model: provider(modelId),
    stopWhen,
  };

  // SAFETY: Options preserve the SDK toolsContext requirement through Pick. TypeScript cannot
  // resolve its conditional generic after the spread; the provider and defaults complete the settings.
  return new ToolLoopAgent<never, TOOLS, AgentRuntimeContext, AgentOutputSpec<OUTPUT>>(
    settings as ToolLoopAgentSettings<never, TOOLS, AgentRuntimeContext, AgentOutputSpec<OUTPUT>>,
  );
}
