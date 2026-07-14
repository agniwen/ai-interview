import type { StoredSkillResponse, WorkspaceFsWriteResponse } from "@mastra/client-js";

/** Stored-skill record returned by `POST /stored/skills`. */
export const createdSkill: StoredSkillResponse = {
  createdAt: "2026-06-16T00:00:00.000Z",
  description: "desc",
  id: "created",
  instructions: "# Title\nDo X",
  name: "My Skill",
  status: "active",
  updatedAt: "2026-06-16T00:00:00.000Z",
};

/** Success response from `POST /workspaces/:workspaceId/fs/write`. */
export const workspaceWriteOk: WorkspaceFsWriteResponse = {
  path: "skills/SKILL.md",
  success: true,
};
