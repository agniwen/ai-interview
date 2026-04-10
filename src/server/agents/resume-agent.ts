import type { StopCondition, ToolSet } from 'ai';
import { stepCountIs, ToolLoopAgent } from 'ai';
import { createAlibabaProvider } from './provider';

export interface CreateResumeAgentOptions<TOOLS extends ToolSet> {
  instructions: string
  tools?: TOOLS
  modelId?: string
  enableThinking?: boolean
  stopWhen?: StopCondition<TOOLS> | Array<StopCondition<TOOLS>>
  temperature?: number
  output?: unknown
}

export function createResumeAgent<TOOLS extends ToolSet>({
  instructions,
  tools,
  modelId = process.env.ALIBABA_MODEL ?? 'qwen3.6-plus',
  enableThinking = true,
  stopWhen = stepCountIs(8),
  temperature,
  output,
}: CreateResumeAgentOptions<TOOLS>) {
  const provider = createAlibabaProvider({ enableThinking });

  return new ToolLoopAgent({
    model: provider(modelId),
    instructions,
    tools,
    stopWhen,
    temperature,
    output: output as never,
  });
}
