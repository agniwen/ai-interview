import { useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { formatDefaultMeetingTitle } from "@app/shared/utils/time";
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
import { createMeetingLiveTranscriptHints } from "@/lib/meeting-capture/meeting-live-transcript-hints";
import { createDurableLiveTranscriptDraft } from "@/lib/meeting-capture/live-transcript-draft";
import { desktopMeetingKeys, requestRecordingTitle } from "@/lib/client/meetings";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { MeetingActiveRecordingIndicator } from "./meeting-capture-status";
import {
  captureSnapshotAtom,
  liveTranscriptDraftAtom,
  pendingMeetingDiscardAtom,
  preselectedResumeRecordAtom,
} from "./meeting-recording-store";
import {
  getRecordingTitleCandidate,
  RECORDING_TITLE_DELAY_MS,
  TITLE_GENERATION_STATES,
} from "./meeting-recording-title";

export interface OpenMeetingRecordingOptions {
  /** 预选招聘台记录 id（从卡片点入时传入）。 */
  resumeRecordId?: string | null;
  /** 可选完整记录，便于初始化页立刻展示详情（不必等列表回填）。 */
  resumeRecord?: ResumeLibraryListRecord | null;
}

interface MeetingRecordingContextValue {
  continueInterruptedRecording: (captureId: string) => Promise<void>;
  openMeetingRecording: (options?: OpenMeetingRecordingOptions) => void;
  pauseRecording: () => Promise<void>;
  requestDiscard: (captureId?: string, includeSaved?: boolean) => void;
  resumeRecording: () => Promise<void>;
  saveRecording: (captureId?: string) => Promise<void>;
  startRecording: (input: {
    microphoneDeviceId?: string;
    recruitingRecord: ResumeLibraryListRecord | null;
    recruitingRecordId: string | null;
  }) => Promise<{ captureId: string }>;
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
  const liveTranscriptDraft = useAtomValue(liveTranscriptDraftAtom);
  const [pendingDiscard, setPendingDiscard] = useAtom(pendingMeetingDiscardAtom);
  const setPreselectedResumeRecord = useSetAtom(preselectedResumeRecordAtom);
  const titledCaptureIds = useRef(new Set<string>());
  const titleRequests = useRef(new Set<string>());
  const titleRetryAfter = useRef(new Map<string, number>());
  const titleRetryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localSessionTitles = useRef(new Map<string, string>());
  const captureSnapshotRef = useRef(captureSnapshot);
  const liveTranscriptDraftRef = useRef(liveTranscriptDraft);
  captureSnapshotRef.current = captureSnapshot;
  liveTranscriptDraftRef.current = liveTranscriptDraft;
  localSessionTitles.current = new Map(
    captureSnapshot.localSessions.map((session) => [session.id, session.title]),
  );
  const activeCaptureId = captureSnapshot.active?.captureId;
  const activeStartedAt = captureSnapshot.active?.startedAt;

  useEffect(() => {
    if (
      !(activeCaptureId && activeStartedAt && liveTranscriptDraft.captureId === activeCaptureId)
    ) {
      return;
    }
    const durableDraft = createDurableLiveTranscriptDraft(liveTranscriptDraft, activeCaptureId);
    if (!durableDraft) {
      return;
    }
    const timer = setTimeout(() => {
      void meetingCapture.updateLocalSession(activeCaptureId, {
        liveTranscriptDraft: durableDraft,
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeCaptureId, activeStartedAt, liveTranscriptDraft]);

  const attemptTitleGenerationRef = useRef<(captureId: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const scheduleTitleGenerationRef = useRef<((captureId: string, delayMs: number) => void) | null>(
    null,
  );

  scheduleTitleGenerationRef.current = (captureId, delayMs) => {
    if (titleRetryTimers.current.has(captureId)) {
      return;
    }
    const timer = setTimeout(() => {
      titleRetryTimers.current.delete(captureId);
      void attemptTitleGenerationRef.current(captureId);
    }, delayMs);
    titleRetryTimers.current.set(captureId, timer);
  };

  attemptTitleGenerationRef.current = async (captureId) => {
    const session = captureSnapshotRef.current.localSessions.find((item) => item.id === captureId);
    if (!session || titledCaptureIds.current.has(captureId)) {
      return;
    }
    const latestDraft = createDurableLiveTranscriptDraft(liveTranscriptDraftRef.current, captureId);
    const candidate = getRecordingTitleCandidate(session, latestDraft, Date.now());
    if (!candidate) {
      if (
        TITLE_GENERATION_STATES.has(session.state) &&
        session.title === formatDefaultMeetingTitle(session.startedAt) &&
        Date.now() - Date.parse(session.startedAt) >= RECORDING_TITLE_DELAY_MS
      ) {
        scheduleTitleGenerationRef.current?.(captureId, 5000);
      }
      return;
    }
    if (
      titleRequests.current.has(captureId) ||
      Date.now() < (titleRetryAfter.current.get(captureId) ?? 0)
    ) {
      return;
    }

    titleRequests.current.add(captureId);
    try {
      const workspace = await resolveActiveWorkspace();
      if (!workspace) {
        throw new Error("当前没有可用工作区");
      }
      const title = await requestRecordingTitle(workspace.slug, candidate.transcript);
      const currentTitle = localSessionTitles.current.get(captureId);
      if (currentTitle && currentTitle !== formatDefaultMeetingTitle(candidate.startedAt)) {
        return;
      }
      await meetingCapture.updateLocalSession(captureId, { title });
      titleRetryAfter.current.delete(captureId);
      titledCaptureIds.current.add(captureId);
    } catch (error) {
      titleRetryAfter.current.set(captureId, Date.now() + 30_000);
      scheduleTitleGenerationRef.current?.(captureId, 30_000);
      console.warn("[meeting-capture] AI title generation failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      titleRequests.current.delete(captureId);
    }
  };

  useEffect(() => {
    const sessionsById = new Map(
      captureSnapshot.localSessions.map((session) => [session.id, session]),
    );
    for (const [captureId, timer] of titleRetryTimers.current) {
      const session = sessionsById.get(captureId);
      if (!session || session.title !== formatDefaultMeetingTitle(session.startedAt)) {
        clearTimeout(timer);
        titleRetryTimers.current.delete(captureId);
      }
    }
    const nowMs = Date.now();
    for (const session of captureSnapshot.localSessions) {
      if (
        session.title !== formatDefaultMeetingTitle(session.startedAt) ||
        titledCaptureIds.current.has(session.id) ||
        titleRequests.current.has(session.id) ||
        !TITLE_GENERATION_STATES.has(session.state)
      ) {
        continue;
      }
      const startedAtMs = Date.parse(session.startedAt);
      if (Number.isNaN(startedAtMs)) {
        continue;
      }
      scheduleTitleGenerationRef.current?.(
        session.id,
        Math.max(0, startedAtMs + RECORDING_TITLE_DELAY_MS - nowMs),
      );
    }
  }, [captureSnapshot.localSessions]);

  useEffect(
    () => () => {
      for (const timer of titleRetryTimers.current.values()) {
        clearTimeout(timer);
      }
      titleRetryTimers.current.clear();
    },
    [],
  );

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

  const pendingWorkspaceUploadKey = [
    ...captureSnapshot.workspaceSaves
      .filter((item) => item.state === "waiting-for-network")
      .map((item) => item.captureId),
    ...captureSnapshot.recoverable
      .filter(
        (item) =>
          item.status === "saved-local" &&
          !item.recoveryCopyDeleteAfter &&
          !captureSnapshot.workspaceSaves.some((save) => save.captureId === item.captureId),
      )
      .map((item) => item.captureId),
  ]
    .toSorted()
    .join(",");
  const retriedWorkspaceUploadKeys = useRef(new Set<string>());
  useEffect(() => {
    if (!(captureSnapshot.recoveryComplete && pendingWorkspaceUploadKey)) {
      return;
    }
    if (retriedWorkspaceUploadKeys.current.has(pendingWorkspaceUploadKey)) {
      return;
    }
    const retryPendingUploads = async () => {
      const workspace = await resolveActiveWorkspace();
      if (!workspace) {
        return;
      }
      retriedWorkspaceUploadKeys.current.add(pendingWorkspaceUploadKey);
      await meetingCapture.retryPendingWorkspaceSaves();
    };
    void retryPendingUploads();
  }, [captureSnapshot.recoveryComplete, pendingWorkspaceUploadKey]);

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

  const startRecording = useCallback(
    async (input: {
      microphoneDeviceId?: string;
      recruitingRecord: ResumeLibraryListRecord | null;
      recruitingRecordId: string | null;
    }) => {
      const result = await meetingCapture.start({
        liveTranscriptHints: input.recruitingRecord
          ? createMeetingLiveTranscriptHints(input.recruitingRecord)
          : undefined,
        microphoneDeviceId: input.microphoneDeviceId,
        recruitingRecordId: input.recruitingRecordId,
      });
      toast.success("录制已开始，断网不会中断本地录音");
      return result;
    },
    [],
  );

  const continueInterruptedRecording = useCallback(async (captureId: string) => {
    try {
      await meetingCapture.continueInterrupted(captureId);
      toast.success("已继续录制");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "继续中断录制失败");
    }
  }, []);

  const saveRecording = useCallback(async (captureId?: string) => {
    try {
      await meetingCapture.save({ captureId });
      toast.success("双轨录音已安全保存到本地");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存本地录音失败");
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      await meetingCapture.pause();
      toast.success("录制已暂停");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "暂停录制失败");
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await meetingCapture.resume();
      toast.success("录制已继续");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "继续录制失败");
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
      continueInterruptedRecording,
      openMeetingRecording,
      pauseRecording,
      requestDiscard,
      resumeRecording,
      saveRecording,
      startRecording,
    }),
    [
      continueInterruptedRecording,
      openMeetingRecording,
      pauseRecording,
      requestDiscard,
      resumeRecording,
      saveRecording,
      startRecording,
    ],
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
            <Button
              onClick={() => {
                discardRecording();
              }}
              type="button"
              variant="destructive"
            >
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
