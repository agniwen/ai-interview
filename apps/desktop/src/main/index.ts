import { captureDesktopMainException } from "./sentry";

import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import macIcon from "../../resources/icon-mac.png?asset";
import { registerContextMenu } from "./context-menu";
import { registerOrpcIpc } from "./orpc";
import { applySettingsAtStartup } from "./settings";
import { registerAuthIpc } from "./ipc/auth";
import { registerDownloadIpc } from "./ipc/download";
import { registerMeetingPlaybackIpc } from "./ipc/meeting-playback";
import { registerWindowIpc } from "./ipc/window";
import {
  isTrustedMainFrame,
  registerMeetingCaptureIpc,
  registerMeetingCaptureMediaSession,
} from "./meeting-capture/ipc";
import { registerLiveTranscriptIpc } from "./meeting-capture/live-transcript-ipc";
import { LocalMeetingRecordingStore } from "./meeting-capture/local-meeting-recording-store";
import { LocalMeetingSessionStore } from "./meeting-capture/local-meeting-session-store";
import { DesktopDatabase } from "./database";
import { createMainWindow, getMainWindowWebContents } from "./window";

// 全局未捕获异常/拒绝兜底：主进程任何未捕获错误都落一条带 stack 的日志，
// 避免分片 ack 静默丢失后只能看到“落盘超时”而不知主进程已死。
// Global safety net: any uncaught main-process error logs a stack so a dead
// renderer-facing port never masquerades as a silent fragment-write timeout.
process.on("uncaughtException", (error) => {
  captureDesktopMainException(error, "desktop.uncaught-exception");
  console.error("[main] uncaughtException", {
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});
process.on("unhandledRejection", (reason) => {
  captureDesktopMainException(reason, "desktop.unhandled-rejection");
  console.error("[main] unhandledRejection", {
    errorMessage: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

if (process.platform === "darwin" && !app.isPackaged) {
  app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}

function handleActivate(): void {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  electronApp.setAppUserModelId("com.arc.ai-recruitment-copilot-desktop");
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock?.setIcon(macIcon);
  }

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  applySettingsAtStartup();
  registerContextMenu();
  const userDataRoot = app.getPath("userData");
  const recordingRoot = join(userDataRoot, "meeting-capture", "default-profile");
  const localDatabase = new DesktopDatabase({
    legacyPaths: [join(recordingRoot, "db.sqlite"), join(recordingRoot, "sessions.sqlite")],
    migrationsFolder: app.isPackaged
      ? join(process.resourcesPath, "desktop-db-migrations")
      : join(app.getAppPath(), "drizzle-local"),
    path: join(userDataRoot, "default-profile", "db.sqlite"),
  });
  const meetingCaptureStore = new LocalMeetingRecordingStore(recordingRoot, {
    sessionStore: new LocalMeetingSessionStore(localDatabase),
  });
  app.once("will-quit", () => localDatabase.close());
  registerMeetingCaptureIpc(meetingCaptureStore);
  registerMeetingCaptureMediaSession();
  registerLiveTranscriptIpc();
  registerOrpcIpc();
  registerWindowIpc();
  registerAuthIpc();
  registerDownloadIpc();
  registerMeetingPlaybackIpc(import.meta.env.VITE_RECORDING_R2_UPLOAD_ORIGIN, isTrustedMainFrame);
  createMainWindow();
  app.on("activate", handleActivate);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", () => {
    const contents = getMainWindowWebContents();
    const mainWindow = contents ? BrowserWindow.fromWebContents(contents) : null;
    if (mainWindow?.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow?.show();
    mainWindow?.focus();
  });
  void bootstrap();
} else {
  app.quit();
}
