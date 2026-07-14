import type { GetAgentResponse, GetMemoryStatusResponse } from "@mastra/client-js";

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

export const memoryDisabled: GetMemoryStatusResponse = {
  result: false,
};
