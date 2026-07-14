import type {
  BuilderAvailableModelsResponse,
  BuilderSettingsResponse,
  GetAgentResponse,
  GetToolResponse,
  GetWorkflowResponse,
  ListStoredSkillsResponse,
} from "@mastra/client-js";

export const settingsAllFeatures: BuilderSettingsResponse = {
  enabled: true,
  features: {
    agent: {
      agents: true,
      avatarUpload: true,
      browser: true,
      favorites: true,
      memory: true,
      model: true,
      skills: true,
      tools: true,
      workflows: true,
    },
  },
};

export const settingsAgentsOnly: BuilderSettingsResponse = {
  enabled: true,
  features: {
    agent: {
      agents: true,
    },
  },
  modelPolicy: { active: false },
};

export const settingsPartialFeatures: BuilderSettingsResponse = {
  enabled: true,
  features: {
    agent: {
      agents: false,
      skills: false,
      tools: true,
      workflows: true,
    },
  },
};

export const emptyAvailableModels: BuilderAvailableModelsResponse = {
  providers: [],
};

export const emptyAgents: Record<string, GetAgentResponse> = {};

export const oneOtherAgent: Record<string, GetAgentResponse> = {
  "helper-agent": {
    agents: {},
    defaultGenerateOptionsLegacy: {},
    defaultOptions: {},
    defaultStreamOptionsLegacy: {},
    id: "helper-agent",
    instructions: "You are a helper agent.",
    modelId: "gpt-5-mini",
    modelList: undefined,
    modelVersion: "v2",
    name: "Helper Agent",
    provider: "openai",
    tools: {},
    workflows: {},
  },
};
export const emptyTools: Record<string, GetToolResponse> = {};
export const emptyWorkflows: Record<string, GetWorkflowResponse> = {};

export const emptyStoredSkills: ListStoredSkillsResponse = {
  hasMore: false,
  page: 1,
  perPage: 50,
  skills: [],
  total: 0,
};
