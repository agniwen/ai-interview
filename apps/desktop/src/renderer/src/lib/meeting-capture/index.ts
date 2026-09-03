import { createMeetingCapture } from "../../../../preload/meeting-capture";
import { BrowserDualTrackCaptureSource } from "./browser-dual-track-capture-source";
import { DesktopMeetingRecordingStore } from "./desktop-meeting-recording-store";
import { DesktopWorkspaceRecordingPort } from "./desktop-workspace-recording-port";
import { meetingLiveTranscriptDraft } from "./live-transcript-draft-client";

export const meetingCapture = createMeetingCapture({
  source: new BrowserDualTrackCaptureSource(meetingLiveTranscriptDraft),
  store: new DesktopMeetingRecordingStore(),
  workspace: new DesktopWorkspaceRecordingPort(),
});
