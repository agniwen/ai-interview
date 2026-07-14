import type {
  BuilderSettingsResponse,
  GetMemoryStatusResponse,
  GetObservationalMemoryResponse,
  ListMemoryThreadMessagesResponse,
} from "@mastra/client-js";
import type { AuthCapabilities } from "@/domains/auth/types";

export const memoryEnabled: GetMemoryStatusResponse = {
  result: true,
};

export const rbacDisabledAuth = {
  access: {
    permissions: [],
    roles: [],
  },
  capabilities: {
    acl: false,
    rbac: false,
    session: true,
    sso: false,
    user: true,
  },
  enabled: false,
  login: null,
  user: { id: "user-1" },
} satisfies AuthCapabilities;

export const builderDisabled: BuilderSettingsResponse = {
  enabled: false,
};

export const observationalMemory: GetObservationalMemoryResponse = {
  history: [
    {
      activeObservations: "## Recent\n🟡 [10:01] User asked about onboarding",
      config: { messageTokens: 2000, observationTokens: 1000 },
      createdAt: "2026-06-01T10:00:00.000Z",
      generationCount: 1,
      id: "om-1",
      isObserving: false,
      isReflecting: false,
      lastObservedAt: "2026-06-01T10:01:00.000Z",
      observationTokenCount: 320,
      originType: "observation",
      pendingMessageTokens: 540,
      resourceId: "agent-1",
      scope: "thread",
      threadId: "thread-1",
      totalTokensObserved: 1200,
      updatedAt: "2026-06-01T10:01:00.000Z",
    },
  ],
  record: null,
};

export const threadMessages: ListMemoryThreadMessagesResponse = {
  messages: [
    {
      content: {
        format: 2,
        parts: [{ text: "hello", type: "text" }],
      },
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      id: "msg-1",
      resourceId: "agent-1",
      role: "assistant",
      threadId: "thread-1",
    },
  ],
};
