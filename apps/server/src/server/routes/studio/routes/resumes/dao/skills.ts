import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/resumes/dao/skills";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/resumes/dao/skills";

export const listOrgSkillSuggestions: typeof implementation.listOrgSkillSuggestions =
  bindResumeProcessingDatabase(db, implementation.listOrgSkillSuggestions);
export const normalizeSkill: typeof implementation.normalizeSkill = bindResumeProcessingDatabase(
  db,
  implementation.normalizeSkill,
);
export const syncResumeSkills: typeof implementation.syncResumeSkills =
  bindResumeProcessingDatabase(db, implementation.syncResumeSkills);
