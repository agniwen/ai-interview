import type {
  GetMemoryConfigResponse,
  GetMemoryStatusResponse,
  GetObservationalMemoryResponse,
  ListMemoryThreadMessagesResponse,
} from "@mastra/client-js";

export const memoryEnabledStatus: GetMemoryStatusResponse = {
  memoryType: "local",
  result: true,
};

export const memoryDisabledStatus: GetMemoryStatusResponse = {
  result: false,
};

export const semanticRecallConfig: GetMemoryConfigResponse = {
  config: {
    lastMessages: 10,
    semanticRecall: true,
    workingMemory: { enabled: true },
  },
  memoryType: "local",
};

export const observationalMemoryConfig: GetMemoryConfigResponse = {
  config: {
    lastMessages: 10,
    observationalMemory: { enabled: true },
    semanticRecall: true,
    workingMemory: { enabled: true },
  },
  memoryType: "local",
};

// OM config carrying explicit window thresholds, used to assert the timeline
// panel renders thresholds from the agent config when the record omits them.
export const observationalMemoryConfigWithThresholds: GetMemoryConfigResponse = {
  config: {
    lastMessages: 10,
    observationalMemory: { enabled: true, messageTokens: 30_000, observationTokens: 6000 },
    semanticRecall: true,
    workingMemory: { enabled: true },
  },
  memoryType: "local",
};

// An active OM record with distinct token counts so the timeline panel's
// MESSAGES/OBSERVATIONS readout can be asserted as record-derived (the
// source-of-truth values), not re-derived from message markers.
export const observationalMemoryWithRecord: GetObservationalMemoryResponse = {
  history: [
    {
      activeObservations: "## Recent\n🟡 [10:01] User asked about onboarding",
      config: { messageTokens: 30_000, observationTokens: 6000 },
      createdAt: "2026-06-01T10:00:00.000Z",
      generationCount: 2,
      id: "om-active",
      isObserving: false,
      isReflecting: false,
      lastObservedAt: "2026-06-01T10:05:00.000Z",
      observationTokenCount: 4500,
      originType: "observation",
      pendingMessageTokens: 14_200,
      resourceId: "chef-agent",
      scope: "thread",
      threadId: "real-thread",
      totalTokensObserved: 18_700,
      updatedAt: "2026-06-01T10:05:00.000Z",
    },
  ],
  record: {
    activeObservations: "## Recent\n🟡 [10:01] User asked about onboarding",
    config: { messageTokens: 30_000, observationTokens: 6000 },
    createdAt: "2026-06-01T10:00:00.000Z",
    generationCount: 2,
    id: "om-active",
    isObserving: false,
    isReflecting: false,
    lastObservedAt: "2026-06-01T10:05:00.000Z",
    observationTokenCount: 4500,
    originType: "observation",
    pendingMessageTokens: 14_200,
    resourceId: "chef-agent",
    scope: "thread",
    threadId: "real-thread",
    totalTokensObserved: 18_700,
    updatedAt: "2026-06-01T10:05:00.000Z",
  },
};

// Two OM records at distinct timestamps so the timeline panel's zoom range can
// keep the early record (om-early at 10:01) while excluding the late one
// (om-late at 10:05). The observation bodies are distinct so the filtered
// observation list can be asserted by visible text.
export const observationalMemoryTwoRecords: GetObservationalMemoryResponse = {
  history: [
    {
      activeObservations: "## Recent\n🟡 [10:01] User asked about onboarding",
      config: { messageTokens: 2000, observationTokens: 1000 },
      createdAt: "2026-06-01T10:00:00.000Z",
      generationCount: 1,
      id: "om-early",
      isObserving: false,
      isReflecting: false,
      lastObservedAt: "2026-06-01T10:01:00.000Z",
      observationTokenCount: 320,
      originType: "observation",
      pendingMessageTokens: 540,
      resourceId: "chef-agent",
      scope: "thread",
      threadId: "real-thread",
      totalTokensObserved: 1200,
      updatedAt: "2026-06-01T10:01:00.000Z",
    },
    {
      activeObservations: "## Recent\n🔴 [10:05] User reported a blocking bug",
      config: { messageTokens: 2000, observationTokens: 1000 },
      createdAt: "2026-06-01T10:00:00.000Z",
      generationCount: 2,
      id: "om-late",
      isObserving: false,
      isReflecting: false,
      lastObservedAt: "2026-06-01T10:05:00.000Z",
      observationTokenCount: 640,
      originType: "observation",
      pendingMessageTokens: 880,
      resourceId: "chef-agent",
      scope: "thread",
      threadId: "real-thread",
      totalTokensObserved: 2400,
      updatedAt: "2026-06-01T10:05:00.000Z",
    },
  ],
  record: null,
};

// Messages spanning 10:00–10:05 so the FlameGraph time domain is wide enough
// to drag a zoom handle and collapse the range onto the early window.
export const threadMessagesSpan: ListMemoryThreadMessagesResponse = {
  messages: [
    {
      content: {
        format: 2,
        parts: [{ text: "first message", type: "text" }],
      },
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      id: "msg-start",
      resourceId: "chef-agent",
      role: "user",
      threadId: "real-thread",
    },
    {
      content: {
        format: 2,
        parts: [{ text: "last message", type: "text" }],
      },
      createdAt: new Date("2026-06-01T10:05:00.000Z"),
      id: "msg-end",
      resourceId: "chef-agent",
      role: "assistant",
      threadId: "real-thread",
    },
  ],
};
