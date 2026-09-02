import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/support/resume-pool-utils-jd-recommendations";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/support/resume-pool-utils-jd-recommendations";

export const createDefaultJdRecommendationDeps: typeof implementation.createDefaultJdRecommendationDeps =
  bindResumeProcessingDatabase(db, implementation.createDefaultJdRecommendationDeps);
export const recommendJobDescriptionsForResume: typeof implementation.recommendJobDescriptionsForResume =
  bindResumeProcessingDatabase(db, implementation.recommendJobDescriptionsForResume);
export const scoreJobDescriptionsForResume: typeof implementation.scoreJobDescriptionsForResume =
  bindResumeProcessingDatabase(db, implementation.scoreJobDescriptionsForResume);
