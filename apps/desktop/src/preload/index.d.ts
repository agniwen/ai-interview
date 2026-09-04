import type { ElectronAPI } from "@electron-toolkit/preload";
import type { AuthApi } from "./auth-api";
import type { DownloadApi } from "./download-api";
import type { MeetingCaptureApi } from "./meeting-capture-api";
import type { MeetingPlaybackApi } from "./meeting-playback-api";
import type { WindowApi } from "./window-api";

declare global {
  interface Window {
    api: {
      auth: AuthApi;
      download: DownloadApi;
      meetingCapture: MeetingCaptureApi;
      meetingPlayback: MeetingPlaybackApi;
      window: WindowApi;
    };
    electron: ElectronAPI;
  }
}

export type { AuthApi, DownloadApi, MeetingCaptureApi, MeetingPlaybackApi, WindowApi };
