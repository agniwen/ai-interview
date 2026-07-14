import type { GetAgentResponse, GetMemoryStatusResponse } from "@mastra/client-js";

/** Minimal v2 agent the Thread tree reads for model attribution and memory gating. */
export const v2Agent: GetAgentResponse = {
  agents: {},
  defaultGenerateOptionsLegacy: {},
  defaultOptions: {},
  defaultStreamOptionsLegacy: {},
  id: "agent-1",
  instructions: "You are a test agent.",
  modelId: "gpt-4o-mini",
  modelList: undefined,
  modelVersion: "v2",
  name: "Test Agent",
  provider: "openai",
  tools: {},
  workflows: {},
};

/** Memory disabled — keeps the memory sidebar/status fan-out quiet. */
export const memoryDisabled: GetMemoryStatusResponse = {
  result: false,
};

export const memoryEnabled: GetMemoryStatusResponse = {
  result: true,
};
