import { electronAPI } from "@electron-toolkit/preload";
import { meetingLiveTranscriptTrackSchema } from "@arc/shared/meeting-transcription";
import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import type { AuthApi } from "./auth-api";
import type { DownloadApi } from "./download-api";
import type { MeetingCaptureApi } from "./meeting-capture-api";
import type { WindowApi } from "./window-api";

const liveTranscriptClientMessageSchema = z
  .object({
    authorization: z
      .object({
        baseUrl: z.string(),
        clientSecret: z.string(),
        expiresAt: z.string(),
        language: z.string().optional(),
        model: z.string(),
        provider: z.literal("qwen"),
        track: meetingLiveTranscriptTrackSchema,
      })
      .strict(),
    type: z.literal("start-meeting-live-transcript-client"),
  })
  .strict();

/**
 * oRPC MessageChannel handoff: the renderer creates a MessageChannel and
 * posts one port through the window; we forward it to the main process where
 * the oRPC `RPCHandler` upgrades it. See `src/renderer/src/lib/orpc.ts`.
 */
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.ports.length !== 1
  ) {
    return;
  }
  if (event.data === "start-orpc-client") {
    const [serverPort] = event.ports;
    ipcRenderer.postMessage("start-orpc-server", null, [serverPort]);
  }
  const liveTranscriptMessage = liveTranscriptClientMessageSchema.safeParse(event.data);
  if (liveTranscriptMessage.success) {
    const [serverPort] = event.ports;
    console.log("[preload] forwarding live-transcript port");
    ipcRenderer.postMessage(
      "meeting-live-transcript:port",
      liveTranscriptMessage.data.authorization,
      [serverPort],
    );
  }
});

const windowApi: WindowApi = {
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  platform: process.platform,
};

const authApi: AuthApi = {
  openOAuth: (input) => ipcRenderer.invoke("auth:open-oauth", input),
};

const downloadApi: DownloadApi = {
  start: (url) => ipcRenderer.invoke("download:start", url),
};

const meetingCaptureApi: MeetingCaptureApi = {
  acknowledgeRemoteVisibility: (captureId) =>
    ipcRenderer.invoke("meeting-capture:acknowledge-remote-visibility", captureId),
  appendFragment: (input, bytes) =>
    ipcRenderer.invoke("meeting-capture:append-fragment", input, bytes),
  begin: (input) => ipcRenderer.invoke("meeting-capture:begin", input),
  describeMultipartWorkspaceSave: (captureId) =>
    ipcRenderer.invoke("meeting-capture:describe-multipart-workspace-save", captureId),
  describeWorkspaceSave: (captureId) =>
    ipcRenderer.invoke("meeting-capture:describe-workspace-save", captureId),
  discard: (captureId) => ipcRenderer.invoke("meeting-capture:discard", captureId),
  listLocalSessions: () => ipcRenderer.invoke("meeting-capture:list-local-sessions"),
  markWorkspaceVerified: (captureId, recoveryCopyDeleteAfter) =>
    ipcRenderer.invoke(
      "meeting-capture:mark-workspace-verified",
      captureId,
      recoveryCopyDeleteAfter,
    ),
  recover: () => ipcRenderer.invoke("meeting-capture:recover"),
  resumeInterrupted: (captureId, trackContentTypes) =>
    ipcRenderer.invoke("meeting-capture:resume-interrupted", captureId, trackContentTypes),
  rollbackInterruptedResume: (captureId) =>
    ipcRenderer.invoke("meeting-capture:rollback-interrupted-resume", captureId),
  save: (captureId, liveTranscriptDraft) =>
    ipcRenderer.invoke("meeting-capture:save", captureId, liveTranscriptDraft),
  updateLocalSession: (captureId, patch) =>
    ipcRenderer.invoke("meeting-capture:update-local-session", captureId, patch),
  uploadMultipart: (captureId, instructions) =>
    ipcRenderer.invoke("meeting-capture:upload-multipart", captureId, instructions),
  uploadSmall: (captureId, instructions) =>
    ipcRenderer.invoke("meeting-capture:upload-small", captureId, instructions),
};

const api = {
  auth: authApi,
  download: downloadApi,
  meetingCapture: meetingCaptureApi,
  window: windowApi,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch {
    // Preload isolation failure is fatal for UI controls; surface in main logs later.
  }
} else {
  // @ts-expect-error contextIsolation disabled fallback
  window.electron = electronAPI;
  // @ts-expect-error contextIsolation disabled fallback
  window.api = api;
}
