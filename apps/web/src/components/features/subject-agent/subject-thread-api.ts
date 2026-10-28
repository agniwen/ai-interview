import { SUBJECT_DRAFT_ID_PREFIX } from "@app/db-schema/chat-subject-threads";
import type { ChatSubjectKind } from "@app/db-schema/chat-subject-threads";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export interface SubjectRef {
  kind: ChatSubjectKind;
  slug: string;
  subjectId: string;
}

export const SUBJECT_THREAD_PAGE_SIZE = 50;
/** 面板打开且本人没有在生成时，轮询其他成员的新消息。 */
export const SUBJECT_THREAD_POLL_INTERVAL_MS = 5000;

export const subjectThreadKeys = {
  active: (ref: SubjectRef) => [...subjectThreadKeys.all(ref), "active"] as const,
  all: (ref: SubjectRef) => ["subject-thread", ref.slug, ref.kind, ref.subjectId] as const,
  history: (ref: SubjectRef) => [...subjectThreadKeys.all(ref), "history"] as const,
  preview: (ref: SubjectRef, conversationId: string) =>
    [...subjectThreadKeys.all(ref), "preview", conversationId] as const,
};

const threadRoute = () => rpc.api.w[":slug"].chat["subject-threads"][":kind"][":subjectId"];

function params(ref: SubjectRef) {
  return { kind: ref.kind, slug: ref.slug, subjectId: ref.subjectId };
}

export function fetchActiveSubjectThread(ref: SubjectRef) {
  return rpcFetch(
    threadRoute().$get({ param: params(ref), query: { limit: String(SUBJECT_THREAD_PAGE_SIZE) } }),
    "加载会话失败",
  );
}

export function fetchOlderSubjectThreadMessages(ref: SubjectRef, before: string) {
  return rpcFetch(
    threadRoute().messages.$get({
      param: params(ref),
      query: { before, limit: String(SUBJECT_THREAD_PAGE_SIZE) },
    }),
    "加载更早的消息失败",
  );
}

export function archiveSubjectThread(ref: SubjectRef) {
  return rpcFetch(threadRoute().archive.$post({ param: params(ref) }), "开始新对话失败");
}

export function fetchSubjectThreadHistory(ref: SubjectRef) {
  return rpcFetch(threadRoute().history.$get({ param: params(ref) }), "加载历史会话失败");
}

export function fetchSubjectThreadPreview(ref: SubjectRef, conversationId: string) {
  return rpcFetch(
    threadRoute().history[":conversationId"].$get({
      param: { ...params(ref), conversationId },
    }),
    "加载历史会话失败",
  );
}

export function restoreSubjectThread(ref: SubjectRef, conversationId: string) {
  return rpcFetch(
    threadRoute().history[":conversationId"].restore.$post({
      param: { ...params(ref), conversationId },
    }),
    "恢复会话失败",
  );
}

export function deleteSubjectThread(ref: SubjectRef, conversationId: string) {
  return rpcFetch(
    threadRoute().history[":conversationId"].$delete({
      param: { ...params(ref), conversationId },
    }),
    "删除会话失败",
  );
}

export function subjectThreadMessagesUrl(ref: SubjectRef): string {
  return `/api/w/${encodeURIComponent(ref.slug)}/chat/subject-threads/${ref.kind}/${encodeURIComponent(ref.subjectId)}/messages`;
}

export type ActiveSubjectThread = Awaited<ReturnType<typeof fetchActiveSubjectThread>>;
export type SubjectThreadHistory = Awaited<ReturnType<typeof fetchSubjectThreadHistory>>;

/** 新建页的草稿会话标识；首次保存后用 attachSubjectDraft 转入新记录（ADR-0045）。 */
export function createSubjectDraftId(): string {
  return `${SUBJECT_DRAFT_ID_PREFIX}${crypto.randomUUID()}`;
}

/** 把草稿会话转入刚保存的记录；草稿没有消息时为空操作。 */
export function attachSubjectDraft(record: SubjectRef, draftId: string) {
  return rpcFetch(
    threadRoute()["attach-draft"].$post({ json: { draftId }, param: params(record) }),
    "转入草稿对话失败",
  );
}
