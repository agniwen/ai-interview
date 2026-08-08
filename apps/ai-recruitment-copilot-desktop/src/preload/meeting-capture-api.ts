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

export interface MeetingCaptureApi {
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  markWorkspaceVerified: (captureId: string, recoveryCopyDeleteAfter: string) => Promise<void>;
  describeWorkspaceSave: (captureId: string) => Promise<CreateSmallSavedMeetingInput>;
  describeMultipartWorkspaceSave: (captureId: string) => Promise<MultipartSavedMeetingDescriptor>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  save: (captureId: string) => Promise<LocalSavedMeeting>;
  uploadSmall: (captureId: string, instructions: SmallMeetingUploadInstruction[]) => Promise<void>;
  uploadMultipart: (
    captureId: string,
    instructions: MultipartMeetingUploadInstruction[],
  ) => Promise<void>;
}

export interface FragmentWriteRequest {
  bytes: ArrayBuffer;
  id: string;
  input: AppendLocalFragmentInput;
}

export type FragmentWriteResponse =
  | { id: string; ok: true }
  | { error: string; id: string; ok: false };
