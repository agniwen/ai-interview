import { db } from "../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/support/resume-pool-dao";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/support/resume-pool-dao";

export const bindResumePoolItemJobDescription: typeof implementation.bindResumePoolItemJobDescription =
  bindResumeProcessingDatabase(db, implementation.bindResumePoolItemJobDescription);
export const createResumePoolItem: typeof implementation.createResumePoolItem =
  bindResumeProcessingDatabase(db, implementation.createResumePoolItem);
export const deleteOwnPoolItem: typeof implementation.deleteOwnPoolItem =
  bindResumeProcessingDatabase(db, implementation.deleteOwnPoolItem);
export const importPoolItemToResumeLibrary: typeof implementation.importPoolItemToResumeLibrary =
  bindResumeProcessingDatabase(db, implementation.importPoolItemToResumeLibrary);
export const listResumePoolUploaders: typeof implementation.listResumePoolUploaders =
  bindResumeProcessingDatabase(db, implementation.listResumePoolUploaders);
export const loadResumePoolItem: typeof implementation.loadResumePoolItem =
  bindResumeProcessingDatabase(db, implementation.loadResumePoolItem);
export const loadResumePoolJobMatchResult: typeof implementation.loadResumePoolJobMatchResult =
  bindResumeProcessingDatabase(db, implementation.loadResumePoolJobMatchResult);
export const markResumePoolItemParseFailed: typeof implementation.markResumePoolItemParseFailed =
  bindResumeProcessingDatabase(db, implementation.markResumePoolItemParseFailed);
export const markResumePoolItemParsed: typeof implementation.markResumePoolItemParsed =
  bindResumeProcessingDatabase(db, implementation.markResumePoolItemParsed);
export const markResumePoolItemSemanticIndexed: typeof implementation.markResumePoolItemSemanticIndexed =
  bindResumeProcessingDatabase(db, implementation.markResumePoolItemSemanticIndexed);
export const publishPrivatePoolItem: typeof implementation.publishPrivatePoolItem =
  bindResumeProcessingDatabase(db, implementation.publishPrivatePoolItem);
export const queryResumePoolItems: typeof implementation.queryResumePoolItems =
  bindResumeProcessingDatabase(db, implementation.queryResumePoolItems);
