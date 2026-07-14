import type { BuilderAgentFeatures, BuilderSettingsResponse } from "@mastra/client-js";

const ALL_FEATURES_ON: BuilderAgentFeatures = {
  agents: true,
  avatarUpload: true,
  browser: true,
  favorites: true,
  memory: true,
  model: true,
  skills: true,
  tools: true,
  workflows: true,
};

/**
 * Build a typed `GET /editor/builder/settings` response. Defaults to a fully
 * enabled builder with every agent feature on, an active model policy, and an
 * explicit picker allowlist. Override any slice for a given scenario.
 */
export const buildBuilderSettings = (
  overrides: Partial<BuilderSettingsResponse> = {},
): BuilderSettingsResponse => ({
  enabled: true,
  features: { agent: { ...ALL_FEATURES_ON } },
  modelPolicy: {
    active: true,
    allowed: [{ modelId: "gpt-4o", provider: "openai" }],
    default: { modelId: "gpt-4o", provider: "openai" },
  },
  picker: {
    visibleAgents: ["agent-a"],
    visibleTools: ["tool-a", "tool-b"],
    visibleWorkflows: ["workflow-a", "workflow-b"],
  },
  ...overrides,
});
