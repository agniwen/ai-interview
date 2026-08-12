import { useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { meetingCapture } from "@/lib/meeting-capture";
import { meetingLiveTranscriptDraft } from "@/lib/meeting-capture/live-transcript-draft-client";
import { createDurableLiveTranscriptDraft } from "@/lib/meeting-capture/live-transcript-draft";
import { desktopMeetingKeys } from "@/lib/client/meetings";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { MeetingActiveRecordingIndicator } from "./meeting-capture-status";
import {
  captureSnapshotAtom,
  liveTranscriptDraftAtom,
  pendingMeetingDiscardAtom,
  preselectedResumeRecordAtom,
} from "./meeting-recording-store";

export interface OpenMeetingRecordingOptions {
  /** 预选招聘台记录 id（从卡片点入时传入）。 */
  resumeRecordId?: string | null;
  /** 可选完整记录，便于初始化页立刻展示详情（不必等列表回填）。 */
  resumeRecord?: ResumeLibraryListRecord | null;
}

interface MeetingRecordingContextValue {
  openMeetingRecording: (options?: OpenMeetingRecordingOptions) => void;
  requestDiscard: (captureId?: string, includeSaved?: boolean) => void;
  saveRecording: (captureId?: string) => Promise<void>;
  startRecording: (recruitingRecordId: string | null) => Promise<{ captureId: string }>;
}

const MeetingRecordingContext = createContext<MeetingRecordingContextValue | null>(null);

function discardDialogTitle(deletingRecoveryCopy: boolean, includeSaved: boolean): string {
  if (deletingRecoveryCopy) {
    return "提前删除本地 Recovery Copy？";
  }
  return includeSaved ? "清除本地保存？" : "结束并放弃录制？";
}

function discardDialogDescription(deletingRecoveryCopy: boolean, includeSaved: boolean): string {
  if (deletingRecoveryCopy) {
    return "只会删除本机上的恢复副本；已经过服务器验证的工作区录音会继续保留。";
  }
  return includeSaved
    ? "这份录音尚未上传。清除后将无法恢复。"
    : "已录制的麦克风与系统音频会从本机删除，此操作无法撤销。";
}

/**
 * 应用级录制 UI 桥接层：订阅 Preload 状态机并承载导航、Toast 与查询失效，不持有录音事实状态。
 * App-level recording UI bridge: subscribes to preload state and owns navigation/toasts/query invalidation, not capture truth.
 */
export function MeetingRecordingProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const captureSnapshot = useAtomValue(captureSnapshotAtom);
  const [pendingDiscard, setPendingDiscard] = useAtom(pendingMeetingDiscardAtom);
  const setPreselectedResumeRecord = useSetAtom(preselectedResumeRecordAtom);

  const verifiedWorkspaceCaptureIds = captureSnapshot.workspaceSaves
    .filter((item) => item.state === "workspace-verified")
    .map((item) => item.captureId)
    .toSorted()
    .join(",");
  useEffect(() => {
    if (verifiedWorkspaceCaptureIds) {
      void queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.root });
    }
  }, [queryClient, verifiedWorkspaceCaptureIds]);

  const openMeetingRecording = useCallback(
    (options?: OpenMeetingRecordingOptions) => {
      const record = options?.resumeRecord ?? null;
      setPreselectedResumeRecord(record);
      const resumeRecordId = options?.resumeRecordId ?? record?.id ?? undefined;
      // 招聘台入口必须带 resumeRecordId，侧栏入口用空 search，控制是否展示关联字段。
      void navigate({
        search: resumeRecordId ? { resumeRecordId } : {},
        to: "/meetings/new",
      });
    },
    [navigate, setPreselectedResumeRecord],
  );

  const startRecording = useCallback(async (recruitingRecordId: string | null) => {
    const result = await meetingCapture.start({ recruitingRecordId });
    toast.success("会议录制已开始，断网不会中断本地录音");
    return result;
  }, []);

  const saveRecording = useCallback(async (captureId?: string) => {
    try {
      const liveTranscriptDraft = createDurableLiveTranscriptDraft(
        meetingLiveTranscriptDraft.getSnapshot(),
        captureId,
      );
      await meetingCapture.save({ captureId, liveTranscriptDraft });
      toast.success("双轨录音已安全保存到本地");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存本地录音失败");
    }
  }, []);

  const requestDiscard = useCallback(
    (captureId?: string, includeSaved = false) => {
      setPendingDiscard({ captureId, includeSaved });
    },
    [setPendingDiscard],
  );

  const discardRecording = useCallback(async () => {
    if (!pendingDiscard) {
      return;
    }
    const discardedId =
      pendingDiscard.captureId ??
      captureSnapshot.active?.captureId ??
      captureSnapshot.saved?.captureId;
    try {
      await meetingCapture.discard(pendingDiscard);
      setPendingDiscard(null);
      toast.success("本地录音已放弃并清理");
      if (
        discardedId &&
        (pathname === `/meetings/${discardedId}` ||
          pathname.startsWith(`/meetings/${discardedId}/`))
      ) {
        void navigate({ to: "/meetings" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清理本地录音失败");
    }
  }, [
    captureSnapshot.active?.captureId,
    captureSnapshot.saved?.captureId,
    navigate,
    pathname,
    pendingDiscard,
    setPendingDiscard,
  ]);

  const value = useMemo(
    () => ({
      openMeetingRecording,
      requestDiscard,
      saveRecording,
      startRecording,
    }),
    [openMeetingRecording, requestDiscard, saveRecording, startRecording],
  );

  const deletingRecoveryCopy = Boolean(
    pendingDiscard?.captureId &&
    (captureSnapshot.workspaceSaves.some(
      (item) => item.captureId === pendingDiscard.captureId && item.state === "workspace-verified",
    ) ||
      captureSnapshot.recoverable.some(
        (item) => item.captureId === pendingDiscard.captureId && item.recoveryCopyDeleteAfter,
      )),
  );

  return (
    <MeetingRecordingContext.Provider value={value}>
      {children}
      <MeetingActiveRecordingIndicator snapshot={captureSnapshot} />
      <Dialog
        onOpenChange={(next) => {
          if (!next) {
            setPendingDiscard(null);
          }
        }}
        open={Boolean(pendingDiscard)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {discardDialogTitle(deletingRecoveryCopy, Boolean(pendingDiscard?.includeSaved))}
            </DialogTitle>
            <DialogDescription>
              {discardDialogDescription(
                deletingRecoveryCopy,
                Boolean(pendingDiscard?.includeSaved),
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPendingDiscard(null)} type="button" variant="outline">
              取消
            </Button>
            <Button onClick={() => void discardRecording()} type="button" variant="destructive">
              确认放弃
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MeetingRecordingContext.Provider>
  );
}

function useMeetingRecordingContext() {
  const ctx = useContext(MeetingRecordingContext);
  if (!ctx) {
    throw new Error("useMeetingRecordingActions must be used within MeetingRecordingProvider");
  }
  return ctx;
}

export const useMeetingRecordingActions = useMeetingRecordingContext;

export function useMeetingCaptureSnapshot() {
  return useAtomValue(captureSnapshotAtom);
}

export function useMeetingLiveTranscriptDraft() {
  return useAtomValue(liveTranscriptDraftAtom);
}

/** 预选简历由录制入口写入，初始化页读取；search 参数仍是刷新后的事实来源。 */
export function usePreselectedResumeRecord() {
  return useAtomValue(preselectedResumeRecordAtom);
}
