"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { isSubjectDraftId } from "@app/db-schema/chat-subject-threads";
import type { ChatSubjectKind } from "@app/db-schema/chat-subject-threads";
import { useStudioSidePane } from "@/components/features/studio/studio-side-pane-context";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { SUBJECT_AGENT_PANE_ID, SubjectAgentProvider } from "./subject-agent-context";
import { SubjectAgentPane, SubjectAgentTrigger } from "./subject-agent-pane";
import { attachSubjectDraft, createSubjectDraftId } from "./subject-thread-api";
import type { SubjectRef } from "./subject-thread-api";

// 新建页保存后会跳到新记录的编辑页；面板原本打开时在新页面重新打开它。
let pendingPaneReopenSubjectId: string | null = null;

/**
 * 编辑页的实体会话主体：已保存记录用记录 ID，新建页用仅本人可见的草稿 ID（ADR-0045）。
 * Subject for an editor page: the record id, or a creator-private draft id on new-record pages.
 */
export function useSubjectAgentSubject({
  enabled,
  kind,
  recordId,
}: {
  enabled: boolean;
  kind: ChatSubjectKind;
  /** null 表示新建页。 */
  recordId: string | null;
}): SubjectRef | null {
  const slug = useWorkspaceSlug();
  const [draftId] = useState(createSubjectDraftId);
  const subjectId = recordId ?? draftId;
  return useMemo(
    () => (enabled ? { kind, slug, subjectId } : null),
    [enabled, kind, slug, subjectId],
  );
}

/** 顶栏中的 Hireseer Agent 入口；没有主体时不显示。 */
export function useSubjectAgentHeaderActions(subject: SubjectRef | null): ReactNode {
  return useMemo(() => (subject ? <SubjectAgentTrigger /> : null), [subject]);
}

function ReopenPaneAfterCreate({ subjectId }: { subjectId: string }) {
  const pane = useStudioSidePane(SUBJECT_AGENT_PANE_ID);
  const { open } = pane;
  useEffect(() => {
    if (pendingPaneReopenSubjectId === subjectId) {
      pendingPaneReopenSubjectId = null;
      open();
    }
  }, [open, subjectId]);
  return null;
}

/** 为页面挂载实体会话 Provider 和面板内容；表单需在 children 内登记读写接口。 */
export function SubjectAgentScope({
  children,
  subject,
}: {
  children: ReactNode;
  subject: SubjectRef | null;
}) {
  if (!subject) {
    return children;
  }
  return (
    <SubjectAgentProvider key={subject.subjectId} subject={subject}>
      {children}
      <SubjectAgentPane />
      <ReopenPaneAfterCreate subjectId={subject.subjectId} />
    </SubjectAgentProvider>
  );
}

/**
 * 新建记录首次保存后：把草稿会话转入新记录，再继续原有的跳转。转入失败不阻止跳转。
 * After a new record's first save, moves the draft thread onto it before navigating.
 */
export function useAttachSubjectDraftOnCreate(
  subject: SubjectRef | null,
  onCreated: (id: string) => void,
): (id: string) => void {
  const pane = useStudioSidePane(SUBJECT_AGENT_PANE_ID);
  const { isOpen } = pane;
  return useMemo(
    () => async (recordId: string) => {
      if (!(subject && isSubjectDraftId(subject.subjectId))) {
        onCreated(recordId);
        return;
      }
      try {
        await attachSubjectDraft({ ...subject, subjectId: recordId }, subject.subjectId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "转入草稿对话失败");
      }
      pendingPaneReopenSubjectId = isOpen ? recordId : null;
      onCreated(recordId);
    },
    [isOpen, onCreated, subject],
  );
}
