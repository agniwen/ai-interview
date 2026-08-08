import { createMeetingCapture } from "../../../../preload/meeting-capture";
import { BrowserDualTrackCaptureSource } from "./browser-dual-track-capture-source";
import { DesktopMeetingRecordingStore } from "./desktop-meeting-recording-store";

export const meetingCapture = createMeetingCapture({
  source: new BrowserDualTrackCaptureSource(),
  store: new DesktopMeetingRecordingStore(),
});
