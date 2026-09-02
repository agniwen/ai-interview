import { db } from "../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/support/chat-dao-chat-attachments";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/support/chat-dao-chat-attachments";

export const createAttachment: typeof implementation.createAttachment =
  bindResumeProcessingDatabase(db, implementation.createAttachment);
export const findAttachmentByContentHash: typeof implementation.findAttachmentByContentHash =
  bindResumeProcessingDatabase(db, implementation.findAttachmentByContentHash);
export const findAttachmentByStorageKey: typeof implementation.findAttachmentByStorageKey =
  bindResumeProcessingDatabase(db, implementation.findAttachmentByStorageKey);
export const findContentHashByAttachmentId: typeof implementation.findContentHashByAttachmentId =
  bindResumeProcessingDatabase(db, implementation.findContentHashByAttachmentId);
export const getUserAttachment: typeof implementation.getUserAttachment =
  bindResumeProcessingDatabase(db, implementation.getUserAttachment);
export const getUserAttachments: typeof implementation.getUserAttachments =
  bindResumeProcessingDatabase(db, implementation.getUserAttachments);
export const updateAttachmentParseResult: typeof implementation.updateAttachmentParseResult =
  bindResumeProcessingDatabase(db, implementation.updateAttachmentParseResult);
export const updateParseResultByHash: typeof implementation.updateParseResultByHash =
  bindResumeProcessingDatabase(db, implementation.updateParseResultByHash);
export const updateStructuredByHash: typeof implementation.updateStructuredByHash =
  bindResumeProcessingDatabase(db, implementation.updateStructuredByHash);
