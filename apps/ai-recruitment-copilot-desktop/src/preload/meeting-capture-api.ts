import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
  LocalSavedMeeting,
  RecoverableMeetingCapture,
} from "./meeting-capture";

export interface MeetingCaptureApi {
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  save: (captureId: string) => Promise<LocalSavedMeeting>;
}

export interface FragmentWriteRequest {
  bytes: ArrayBuffer;
  id: string;
  input: AppendLocalFragmentInput;
}

export type FragmentWriteResponse =
  | { id: string; ok: true }
  | { error: string; id: string; ok: false };
