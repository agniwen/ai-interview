import type { ResumeUploadBatchItemStatus, ResumeUploadBatchTarget } from "@arc/db-schema/schema";

export const UPLOAD_TASK_INBOX_PAGE_SIZE = 20;

export type UploadTaskQueueState =
  | "active"
  | "cancelled"
  | "completed"
  | "delayed"
  | "duplicate-skipped"
  | "failed"
  | "paused"
  | "prioritized"
  | "unknown"
  | "waiting"
  | "waiting-children";

export interface UploadTaskInboxRecord {
  attemptCount: number;
  batchId: string;
  candidateName: string | null;
  errorMessage: string | null;
  fileSize: number;
  finishedAt: string | null;
  id: string;
  originalFileName: string;
  previewTarget:
    | { id: string; resource: "resume-pool" }
    | { id: string; resource: "resumes" }
    | null;
  progressPercent: number | null;
  queueState: UploadTaskQueueState;
  queuedAt: string | null;
  startedAt: string | null;
  status: ResumeUploadBatchItemStatus;
  target: ResumeUploadBatchTarget;
  targetRole: string | null;
}

export interface UploadTaskInboxPage {
  nextCursor: string | null;
  records: UploadTaskInboxRecord[];
  total: number;
}
