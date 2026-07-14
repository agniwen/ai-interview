import type { ListStoredSkillsResponse, StoredSkillResponse } from "@mastra/client-js";

export const makeStoredSkill = (
  overrides: Partial<StoredSkillResponse> = {},
): StoredSkillResponse => ({
  authorId: overrides.authorId ?? "user-1",
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  description: overrides.description ?? "A useful skill",
  id: overrides.id ?? "skill-1",
  instructions: overrides.instructions ?? "Do useful things.",
  name: overrides.name ?? "My Skill",
  status: overrides.status ?? "active",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  visibility: overrides.visibility ?? "private",
  ...overrides,
});

export const emptyStoredSkills: ListStoredSkillsResponse = {
  hasMore: false,
  page: 1,
  perPage: 50,
  skills: [],
  total: 0,
};

export const oneStoredSkill: ListStoredSkillsResponse = {
  hasMore: false,
  page: 1,
  perPage: 50,
  skills: [makeStoredSkill()],
  total: 1,
};
