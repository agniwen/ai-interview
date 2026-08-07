import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
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

export function MeetingRecordingProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preselectedResumeId, setPreselectedResumeId] = useState<string | null>(null);
  const [preselectedResumeRecord, setPreselectedResumeRecord] =
    useState<ResumeLibraryListRecord | null>(null);

  const openMeetingRecording = useCallback((options?: OpenMeetingRecordingOptions) => {
    const record = options?.resumeRecord ?? null;
    setPreselectedResumeRecord(record);
    setPreselectedResumeId(options?.resumeRecordId ?? record?.id ?? null);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openMeetingRecording }), [openMeetingRecording]);

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
        preselectedResumeId={preselectedResumeId}
        preselectedResumeRecord={preselectedResumeRecord}
      />
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
