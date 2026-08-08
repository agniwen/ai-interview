import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
  LocalSavedMeeting,
  RecoverableMeetingCapture,
} from "./meeting-capture";
import type {
  CreateSmallSavedMeetingInput,
  SmallMeetingUploadInstruction,
} from "@arc/shared/meeting-recording";

export interface MeetingCaptureApi {
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  describeWorkspaceSave: (captureId: string) => Promise<CreateSmallSavedMeetingInput>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  save: (captureId: string) => Promise<LocalSavedMeeting>;
  uploadSmall: (captureId: string, instructions: SmallMeetingUploadInstruction[]) => Promise<void>;
}

export interface FragmentWriteRequest {
  bytes: ArrayBuffer;
  id: string;
  input: AppendLocalFragmentInput;
}

export type FragmentWriteResponse =
  | { id: string; ok: true }
  | { error: string; id: string; ok: false };
