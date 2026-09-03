import { db } from "../../../../../../lib/server/db";
import { createHumanInterviewDocumentSyncProcessor } from "../application/default-human-interview-document-sync";
import { startHumanInterviewDocumentSyncScheduler } from "./document-sync-scheduler";

export function startHumanInterviewDocumentSync() {
  return startHumanInterviewDocumentSyncScheduler(createHumanInterviewDocumentSyncProcessor(db));
}
