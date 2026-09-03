import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/resumes/utils/create-from-storage";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/resumes/utils/create-from-storage";

export const createResumeRecordFromStorage: typeof implementation.createResumeRecordFromStorage =
  bindResumeProcessingDatabase(db, implementation.createResumeRecordFromStorage);
