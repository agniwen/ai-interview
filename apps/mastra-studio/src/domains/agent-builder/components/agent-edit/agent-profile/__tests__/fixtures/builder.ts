import type {
  BuilderAvailableModelsResponse,
  BuilderSettingsResponse,
  ChannelPlatformInfo,
  ListStoredWorkspacesResponse,
  StoredAgentDependentsResponse,
  StoredAgentResponse,
} from "@mastra/client-js";

import type { AuthCapabilities, CurrentUser } from "@/domains/auth/types";

export const TEST_AGENT_ID = "agent_test";

/**
 * `GET /api/editor/builder/settings` fixture. All agent features are off by
 * default so the wizard resolves the minimal onboarding tree
 * (ready > identity > instructions > library > [integrations] > end).
 */
export const buildBuilderSettings = (
  overrides?: Partial<BuilderSettingsResponse>,
): BuilderSettingsResponse => ({
  enabled: true,
  features: {
    agent: {
      agents: false,
      avatarUpload: false,
      browser: false,
      favorites: false,
      memory: false,
      model: false,
      skills: false,
      tools: false,
      workflows: false,
    },
  },
  ...overrides,
});

/**
 * `GET /api/editor/builder/models/available` fixture. The server returns the
 * already policy-filtered provider/model list; `useAllModels` flattens each
 * provider's `models` array into `{ provider, providerName, model }` entries.
 */
export const buildAvailableModels = (
  overrides?: Partial<BuilderAvailableModelsResponse>,
): BuilderAvailableModelsResponse => ({
  providers: [
    { connected: true, envVar: "OPENAI_API_KEY", id: "openai", models: ["gpt-4o"], name: "OpenAI" },
    {
      connected: true,
      envVar: "ANTHROPIC_API_KEY",
      id: "anthropic",
      models: ["claude-3-5-sonnet"],
      name: "Anthropic",
    },
  ],
  ...overrides,
});

export const buildStoredAgent = (
  overrides?: Partial<StoredAgentResponse>,
): StoredAgentResponse => ({
  authorId: "user-1",
  createdAt: "2026-04-29T10:00:00.000Z",
  description: "A test agent",
  id: TEST_AGENT_ID,
  instructions: "Be helpful.",
  model: { name: "test-model", provider: "openai" },
  name: "Test agent",
  status: "draft",
  updatedAt: "2026-04-29T10:00:00.000Z",
  visibility: "private",
  ...overrides,
});

/** Authenticated, RBAC off — all permission checks pass. */
export const authCapabilities: AuthCapabilities = {
  access: null,
  capabilities: { acl: false, rbac: false, session: false, sso: false, user: true },
  enabled: true,
  login: null,
  user: { id: "user-1" },
};

export const currentUser: CurrentUser = { id: "user-1" };

export const emptyWorkspaces: ListStoredWorkspacesResponse = {
  hasMore: false,
  page: 1,
  perPage: 50,
  total: 0,
  workspaces: [],
};

export const noPlatforms: ChannelPlatformInfo[] = [];

export const noDependents: StoredAgentDependentsResponse = { dependents: [], hiddenCount: 0 };

/** A configured integration keeps the `integrations` step after `library`. */
export const configuredSlackPlatform: ChannelPlatformInfo[] = [
  { id: "slack", isConfigured: true, name: "Slack" },
];
