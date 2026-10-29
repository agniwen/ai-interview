"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { isSubjectDraftId } from "@app/db-schema/chat-subject-threads";
import type { ChatSubjectKind } from "@app/db-schema/chat-subject-threads";
import {
  useStudioSidePane,
  useStudioSidePaneController,
} from "@/components/features/studio/studio-side-pane-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { SUBJECT_AGENT_PANE_ID, SubjectAgentProvider } from "./subject-agent-context";
import { SubjectAgentPane, SubjectAgentTrigger } from "./subject-agent-pane";
import { attachSubjectDraft, createSubjectDraftId } from "./subject-thread-api";
import type { SubjectRef } from "./subject-thread-api";

// 新建页保存后会跳到新记录的编辑页；编辑页沿用新建页上面板的开关状态。
// After the first save the create page jumps to the edit page, which keeps the pane's open state.
let paneStateAfterCreate: { open: boolean; subjectId: string } | null = null;

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

/**
 * 进入编辑/新建页时桌面端默认打开 Agent 面板；窄屏的抽屉会盖住表单，保持收起。
 * 每个主体只在进入时打开一次，用户关闭后不再自动打开。
 * Opens the Agent pane on entry at desktop widths (the narrow-screen drawer would cover the form),
 * once per subject so a pane the user closed stays closed.
 */
export function SubjectAgentPaneAutoOpen({ subjectId }: { subjectId: string }) {
  const { open } = useStudioSidePaneController();
  // 与顶栏入口一致：没有对话权限时不打开。 Matches the header trigger's chat permission.
  const canUseChat = useHasPermission("chat", "read");
  useEffect(() => {
    if (!canUseChat) {
      return;
    }
    const carried = paneStateAfterCreate?.subjectId === subjectId ? paneStateAfterCreate : null;
    paneStateAfterCreate = null;
    const shouldOpen = carried
      ? carried.open
      : (window.matchMedia?.("(min-width: 1024px)").matches ?? false);
    if (shouldOpen) {
      open(SUBJECT_AGENT_PANE_ID);
    }
  }, [canUseChat, open, subjectId]);
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
      <SubjectAgentPaneAutoOpen subjectId={subject.subjectId} />
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
      paneStateAfterCreate = { open: isOpen, subjectId: recordId };
      onCreated(recordId);
    },
    [isOpen, onCreated, subject],
  );
}
