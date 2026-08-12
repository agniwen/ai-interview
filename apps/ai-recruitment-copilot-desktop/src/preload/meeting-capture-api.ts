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

export interface MeetingCaptureApi {
  appendFragment: (input: AppendLocalFragmentInput, bytes: Uint8Array) => Promise<void>;
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  markWorkspaceVerified: (captureId: string, recoveryCopyDeleteAfter: string) => Promise<void>;
  describeWorkspaceSave: (captureId: string) => Promise<CreateSmallSavedMeetingInput>;
  describeMultipartWorkspaceSave: (captureId: string) => Promise<MultipartSavedMeetingDescriptor>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  save: (
    captureId: string,
    liveTranscriptDraft?: MeetingLiveTranscriptDraft | null,
  ) => Promise<LocalSavedMeeting>;
  uploadSmall: (captureId: string, instructions: SmallMeetingUploadInstruction[]) => Promise<void>;
  uploadMultipart: (
    captureId: string,
    instructions: MultipartMeetingUploadInstruction[],
  ) => Promise<void>;
}
