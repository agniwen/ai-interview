import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { MeetingCaptureStatus } from "./meeting-capture-status";
import { NewMeetingRecordingDialog } from "./new-meeting-recording-dialog";

export interface OpenMeetingRecordingOptions {
  /** 预选招聘台记录 id（从卡片点入时传入）。 */
  resumeRecordId?: string | null;
  /** 可选完整记录，便于弹窗立刻展示详情（不必等列表回填）。 */
  resumeRecord?: ResumeLibraryListRecord | null;
}

interface MeetingRecordingContextValue {
  openMeetingRecording: (options?: OpenMeetingRecordingOptions) => void;
}

const MeetingRecordingContext = createContext<MeetingRecordingContextValue | null>(null);

const INITIAL_CAPTURE_SNAPSHOT: MeetingCaptureSnapshot = {
  active: null,
  error: null,
  phase: "idle",
  recoverable: [],
  recoveryComplete: false,
  saved: null,
};

export function MeetingRecordingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preselectedResumeId, setPreselectedResumeId] = useState<string | null>(null);
  const [preselectedResumeRecord, setPreselectedResumeRecord] =
    useState<ResumeLibraryListRecord | null>(null);
  const [captureSnapshot, setCaptureSnapshot] = useState(INITIAL_CAPTURE_SNAPSHOT);
  const [pendingDiscard, setPendingDiscard] = useState<{
    captureId?: string;
    includeSaved: boolean;
  } | null>(null);

  useEffect(() => meetingCapture.observe(setCaptureSnapshot), []);

  const openMeetingRecording = useCallback((options?: OpenMeetingRecordingOptions) => {
    const record = options?.resumeRecord ?? null;
    setPreselectedResumeRecord(record);
    setPreselectedResumeId(options?.resumeRecordId ?? record?.id ?? null);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openMeetingRecording }), [openMeetingRecording]);

  const startRecording = useCallback(async (recruitingRecordId: string | null) => {
    await meetingCapture.start({ recruitingRecordId });
    setOpen(false);
    toast.success("会议录制已开始，断网不会中断本地录音");
  }, []);

  const saveRecording = useCallback(async (captureId?: string) => {
    try {
      await meetingCapture.save({ captureId });
      toast.success("双轨录音已安全保存到本地");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存本地录音失败");
    }
  }, []);

  const discardRecording = useCallback(async () => {
    if (!pendingDiscard) {
      return;
    }
    try {
      await meetingCapture.discard(pendingDiscard);
      setPendingDiscard(null);
      toast.success("本地录音已放弃并清理");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清理本地录音失败");
    }
  }, [pendingDiscard]);

  return (
    <MeetingRecordingContext.Provider value={value}>
      {children}
      <NewMeetingRecordingDialog
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPreselectedResumeId(null);
            setPreselectedResumeRecord(null);
          }
        }}
        open={open}
        onStart={startRecording}
        preselectedResumeId={preselectedResumeId}
        preselectedResumeRecord={preselectedResumeRecord}
      />
      <MeetingCaptureStatus
        onDiscard={(captureId, includeSaved = false) =>
          setPendingDiscard({ captureId, includeSaved })
        }
        onSave={(captureId) => void saveRecording(captureId)}
        snapshot={captureSnapshot}
      />
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
              {pendingDiscard?.includeSaved ? "清除本地保存？" : "结束并放弃录制？"}
            </DialogTitle>
            <DialogDescription>
              {pendingDiscard?.includeSaved
                ? "这份录音尚未上传。清除后将无法恢复。"
                : "已录制的麦克风与系统音频会从本机删除，此操作无法撤销。"}
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

export function useMeetingRecording() {
  const ctx = useContext(MeetingRecordingContext);
  if (!ctx) {
    throw new Error("useMeetingRecording must be used within MeetingRecordingProvider");
  }
  return ctx;
}
