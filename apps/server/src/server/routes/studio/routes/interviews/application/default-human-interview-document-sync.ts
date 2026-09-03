import type { Database } from "@app/database";
import { buildHumanInterviewEvaluationBlock } from "../../../../../integrations/feishu/human-interview-evaluation-doc";
import { updateFeishuHumanInterviewEvaluation } from "../../../../../integrations/feishu/feishu-docx";
import { createHumanInterviewDocumentSyncDao } from "../dao/human-interview-document-sync";
import { syncHumanInterviewDocument } from "./sync-human-interview-document";

export function createHumanInterviewDocumentSyncProcessor(db: Database) {
  const dao = createHumanInterviewDocumentSyncDao(db);
  return () =>
    syncHumanInterviewDocument({
      ...dao,
      updateDocument: (job) =>
        updateFeishuHumanInterviewEvaluation(job.providerId, {
          block: buildHumanInterviewEvaluationBlock(job),
          blockId: job.blockId,
          deadlineAt: job.deadlineAt,
          documentId: job.documentId,
          onBlockCreated: job.onBlockCreated,
          ratingOnly: job.ratingOnly,
          roundLabel: job.roundLabel,
          snapshotId: job.snapshotId,
        }),
    });
}
