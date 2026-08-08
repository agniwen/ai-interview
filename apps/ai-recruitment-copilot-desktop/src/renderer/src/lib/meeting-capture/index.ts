import { createMeetingCapture } from "../../../../preload/meeting-capture";
import { BrowserDualTrackCaptureSource } from "./browser-dual-track-capture-source";
import { DesktopMeetingRecordingStore } from "./desktop-meeting-recording-store";
import { DesktopWorkspaceRecordingPort } from "./desktop-workspace-recording-port";

export const meetingCapture = createMeetingCapture({
  source: new BrowserDualTrackCaptureSource(),
  store: new DesktopMeetingRecordingStore(),
  workspace: new DesktopWorkspaceRecordingPort(),
});
