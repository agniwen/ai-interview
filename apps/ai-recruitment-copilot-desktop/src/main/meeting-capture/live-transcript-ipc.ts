import { ipcMain } from "electron";
import type { IpcMainEvent } from "electron";
import { isTrustedMainFrame } from "./ipc";
import { registerLiveTranscriptIpcHandlers } from "./live-transcript-ipc-handlers";
import type { LiveTranscriptIpcDependencies } from "./live-transcript-ipc-handlers";
import { connectDashScopeRealtimeWs } from "./live-transcript-ws";

export function registerLiveTranscriptIpc(): void {
  const dependencies: LiveTranscriptIpcDependencies<IpcMainEvent> = {
    connect: connectDashScopeRealtimeWs,
    isTrustedMainFrame,
    onPort: (handler) => {
      ipcMain.on("meeting-live-transcript:port", handler);
    },
  };
  registerLiveTranscriptIpcHandlers(dependencies);
}
