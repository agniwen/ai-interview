import "server-only";

import { stepCountIs, ToolLoopAgent } from "ai";
import type { ToolSet } from "ai";
import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import type { CreateResumeAgentOptions } from "@/server/agents/resume-agent";
import { getMastra } from "./index";
import { createAlibabaLanguageModel, createMastraAlibabaModel } from "./models";

const DEFAULT_STEP_MAX_RETRIES = 3;

declare global {
  // eslint-disable-next-line no-var -- Preserve registered text agents across Next.js HMR reloads.
  var arcMastraTextAgents: Map<string, Agent> | undefined;
}

function getTextAgentRegistry(): Map<string, Agent> {
  if (!globalThis.arcMastraTextAgents) {
    globalThis.arcMastraTextAgents = new Map();
  }
  return globalThis.arcMastraTextAgents;
}

export function createMastraTextAgent({
  enableThinking = false,
  id,
  instructions,
  modelId,
  name,
  tools,
  temperature,
  maxOutputTokens,
}: {
  enableThinking?: boolean;
  id: string;
  instructions: string;
  modelId: string;
  name: string;
  tools?: ToolsInput;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  const registryKey = [
    id,
    modelId,
    enableThinking ? "thinking" : "no-thinking",
    temperature ?? "default-temp",
    maxOutputTokens ?? "default-output",
  ].join(":");
  const registry = getTextAgentRegistry();
  const existing = registry.get(registryKey);
  if (existing) {
    return existing;
  }

  const agent = new Agent({
    id,
    instructions,
    model: createMastraAlibabaModel({ modelId }),
    name,
    ...((temperature !== undefined || maxOutputTokens !== undefined) && {
      defaultOptions: {
        modelSettings: {
          ...(temperature !== undefined && { temperature }),
          ...(maxOutputTokens !== undefined && { maxOutputTokens }),
        },
      },
    }),
    ...(tools && { tools }),
  });

  getMastra().addAgent(agent, registryKey);
  registry.set(registryKey, agent);
  return agent;
}

export function createMastraResumeScreeningAgent<TOOLS extends ToolSet>({
  instructions,
  tools,
  modelId = process.env.ALIBABA_MODEL ?? "deepseek-v4-pro",
  enableThinking = true,
  stopWhen = stepCountIs(1),
  temperature,
  maxRetries = DEFAULT_STEP_MAX_RETRIES,
  maxOutputTokens,
  prepareStep,
}: CreateResumeAgentOptions<TOOLS>) {
  return new ToolLoopAgent({
    instructions,
    maxOutputTokens,
    maxRetries,
    model: createAlibabaLanguageModel({ enableThinking, modelId }),
    prepareStep,
    stopWhen,
    temperature,
    tools,
  });
}
