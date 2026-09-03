import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/batches/utils/parsed-resume-enrichment";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/batches/utils/parsed-resume-enrichment";

export const completeParsedResumeEnrichment: typeof implementation.completeParsedResumeEnrichment =
  bindResumeProcessingDatabase(db, implementation.completeParsedResumeEnrichment);
export const generateParsedResumeQuestionsBestEffort: typeof implementation.generateParsedResumeQuestionsBestEffort =
  bindResumeProcessingDatabase(db, implementation.generateParsedResumeQuestionsBestEffort);
