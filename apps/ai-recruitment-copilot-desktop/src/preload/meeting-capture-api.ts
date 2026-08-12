import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
  LocalSavedMeeting,
  RecoverableMeetingCapture,
} from "./meeting-capture";
import type {
  CreateSmallSavedMeetingInput,
  MultipartMeetingUploadInstruction,
  MultipartSavedMeetingDescriptor,
  SmallMeetingUploadInstruction,
} from "@arc/shared/meeting-recording";
import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import type { LocalMeetingSession } from "./local-meeting-session";

export interface MeetingCaptureApi {
  acknowledgeRemoteVisibility: (captureId: string) => Promise<void>;
  appendFragment: (input: AppendLocalFragmentInput, bytes: Uint8Array) => Promise<void>;
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  markWorkspaceVerified: (captureId: string, recoveryCopyDeleteAfter: string) => Promise<void>;
  listLocalSessions: () => Promise<LocalMeetingSession[]>;
  describeWorkspaceSave: (captureId: string) => Promise<CreateSmallSavedMeetingInput>;
  describeMultipartWorkspaceSave: (captureId: string) => Promise<MultipartSavedMeetingDescriptor>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  resumeInterrupted: (
    captureId: string,
    trackContentTypes: Record<"microphone" | "system", string>,
  ) => Promise<void>;
  rollbackInterruptedResume: (captureId: string) => Promise<void>;
  save: (
    captureId: string,
    liveTranscriptDraft?: MeetingLiveTranscriptDraft | null,
  ) => Promise<LocalSavedMeeting>;
  uploadSmall: (captureId: string, instructions: SmallMeetingUploadInstruction[]) => Promise<void>;
  uploadMultipart: (
    captureId: string,
    instructions: MultipartMeetingUploadInstruction[],
  ) => Promise<void>;
  updateLocalSession: (
    captureId: string,
    patch: Partial<
      Pick<
        LocalMeetingSession,
        "endedAt" | "liveTranscriptDraft" | "segmentCount" | "state" | "title"
      >
    >,
  ) => Promise<LocalMeetingSession>;
}
