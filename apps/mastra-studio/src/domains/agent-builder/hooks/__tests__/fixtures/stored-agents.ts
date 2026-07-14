import type { ListStoredAgentsResponse } from "@mastra/client-js";

type StoredAgent = ListStoredAgentsResponse["agents"][number];

const makeAgent = (id: string, status: string): StoredAgent => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  id,
  instructions: "",
  model: { name: "gemini-2.5-flash", provider: "google" },
  name: id,
  status,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

export const emptyStoredAgents: ListStoredAgentsResponse = {
  agents: [],
  hasMore: false,
  page: 1,
  perPage: 50,
  total: 0,
};

export const oneDraftAgent: ListStoredAgentsResponse = {
  agents: [makeAgent("a1", "draft")],
  hasMore: false,
  page: 1,
  perPage: 50,
  total: 1,
};

export const onePublishedAgent: ListStoredAgentsResponse = {
  agents: [makeAgent("p1", "published")],
  hasMore: false,
  page: 1,
  perPage: 50,
  total: 1,
};

export const twoPublishedAgents: ListStoredAgentsResponse = {
  agents: [makeAgent("p1", "published"), makeAgent("p2", "published")],
  hasMore: false,
  page: 1,
  perPage: 50,
  total: 2,
};
