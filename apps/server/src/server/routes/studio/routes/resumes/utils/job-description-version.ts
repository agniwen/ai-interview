import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/resumes/utils/job-description-version";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/resumes/utils/job-description-version";

export const ensureCurrentJobDescriptionVersion: typeof implementation.ensureCurrentJobDescriptionVersion =
  bindResumeProcessingDatabase(db, implementation.ensureCurrentJobDescriptionVersion);
