import { meetingCapture } from "@/lib/meeting-capture";
import { meetingLiveTranscriptDraft } from "@/lib/meeting-capture/live-transcript-draft-client";
import {
  createMeetingRecordingStateBridge,
  meetingRecordingStore,
} from "./meeting-recording-store";

let productionBridge: ReturnType<typeof createMeetingRecordingStateBridge> | null = null;

/** Connect the process-long capture services before any routed page mounts. */
export function initializeMeetingRecordingStore(): void {
  productionBridge ??= createMeetingRecordingStateBridge(
    { capture: meetingCapture, transcript: meetingLiveTranscriptDraft },
    meetingRecordingStore,
  );
}
