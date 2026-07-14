import type {
  BuilderAgentFeatures,
  BuilderAvailableModelsResponse,
  BuilderSettingsResponse,
  ChannelPlatformInfo,
  ListToolProvidersResponse,
  StoredSkillResponse,
} from "@mastra/client-js";

import type { AgentTool } from "../../../../../types/agent-tool";

export const allAgentFeatures: BuilderAgentFeatures = {
  agents: true,
  avatarUpload: true,
  browser: false,
  favorites: true,
  memory: true,
  model: true,
  skills: true,
  tools: true,
  workflows: true,
};

export const makeBuilderSettings = (
  agent: BuilderAgentFeatures = allAgentFeatures,
  modelPolicy: BuilderSettingsResponse["modelPolicy"] = { active: false },
): BuilderSettingsResponse => ({
  enabled: true,
  features: { agent },
  modelPolicy,
});

export const noToolProviders: ListToolProvidersResponse = { providers: [] };

export const noBuilderModels: BuilderAvailableModelsResponse = { providers: [] };

export const openaiBuilderModels: BuilderAvailableModelsResponse = {
  providers: [
    {
      connected: true,
      envVar: "OPENAI_API_KEY",
      id: "openai",
      models: ["gpt-5-mini"],
      name: "OpenAI",
    },
  ],
};

export const slackConfigured: ChannelPlatformInfo[] = [
  { id: "slack", isConfigured: true, name: "Slack" },
];

export const slackUnconfigured: ChannelPlatformInfo[] = [
  { id: "slack", isConfigured: false, name: "Slack" },
];

export const nativeTool: AgentTool = {
  id: "tool-a",
  isChecked: false,
  name: "tool-a",
  type: "tool",
};

export const storedSkill: StoredSkillResponse = {
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "skill-a",
  instructions: "Do the thing.",
  name: "skill-a",
  status: "published",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
