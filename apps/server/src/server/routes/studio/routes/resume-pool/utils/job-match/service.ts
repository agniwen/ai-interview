import { db } from "../../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/support/resume-pool-utils-job-match-service";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/support/resume-pool-utils-job-match-service";

export const matchNewMailResumePoolItem: typeof implementation.matchNewMailResumePoolItem =
  bindResumeProcessingDatabase(db, implementation.matchNewMailResumePoolItem);
export const resolveSelectedCandidateRank: typeof implementation.resolveSelectedCandidateRank =
  bindResumeProcessingDatabase(db, implementation.resolveSelectedCandidateRank);
