import { db } from "../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/support/access-recruiting-visibility";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/support/access-recruiting-visibility";

export const intersectRequestedCreatorIds: typeof implementation.intersectRequestedCreatorIds =
  bindResumeProcessingDatabase(db, implementation.intersectRequestedCreatorIds);
export const resolveRecruitingVisibilityScope: typeof implementation.resolveRecruitingVisibilityScope =
  bindResumeProcessingDatabase(db, implementation.resolveRecruitingVisibilityScope);
export const resolveRecruitingVisibilityScopeFromRows: typeof implementation.resolveRecruitingVisibilityScopeFromRows =
  bindResumeProcessingDatabase(db, implementation.resolveRecruitingVisibilityScopeFromRows);
