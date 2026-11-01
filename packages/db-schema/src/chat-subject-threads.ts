import { z } from "zod";

/**
 * Workspace records that can own a shared Subject Thread (ADR-0045).
 * Extend this list together with the server subject registry and the page that hosts the agent.
 */
export const chatSubjectKindValues = [
  "job_description",
  "interview_question_template",
  "candidate_form_template",
] as const;
export const chatSubjectKindSchema = z.enum(chatSubjectKindValues);
export type ChatSubjectKind = z.infer<typeof chatSubjectKindSchema>;

/** The single agent turn currently running in a Subject Thread; null when idle. */
export interface ChatThreadRunState {
  runId: string;
  startedAt: string;
  userId: string;
}

/**
 * 新建页尚无记录 ID，前端用 `draft-<uuid>` 作为临时主体；服务端按创建人隔离存储，首次保存后
 * 转入新记录。New-record pages address a creator-private draft thread until the first save.
 */
export const SUBJECT_DRAFT_ID_PREFIX = "draft-";
export const subjectDraftIdSchema = z.string().regex(/^draft-[0-9a-f-]{36}$/, "草稿会话标识无效");

export function isSubjectDraftId(subjectId: string): boolean {
  return subjectId.startsWith(SUBJECT_DRAFT_ID_PREFIX);
}

/** 草稿会话在数据库中的 subject_id，带创建人，其他成员无法寻址。 */
export function toStoredSubjectDraftId(userId: string, draftId: string): string {
  return `draft:${userId}:${draftId.slice(SUBJECT_DRAFT_ID_PREFIX.length)}`;
}
