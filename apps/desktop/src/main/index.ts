import "./initialize-app-identity";
import { captureDesktopMainException } from "./sentry";

import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, Menu, nativeImage, powerMonitor, session, Tray } from "electron";
import ffmpegPath from "ffmpeg-static";
import { EchoProcessingService } from "./meeting-processing/service";
import { EchoServerClient } from "./meeting-processing/server-client";
import { registerEchoProcessingIpc } from "./meeting-processing/ipc";
import { loadEchoDeviceId } from "./meeting-processing/device-identity";
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
import { createMainWindow, getMainWindowWebContents, prepareMainWindowQuit } from "./window";

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

let tray: Tray | null = null;
function handleActivate(): void {
  const contents = getMainWindowWebContents();
  const window = contents ? BrowserWindow.fromWebContents(contents) : createMainWindow();
  window?.show();
  window?.focus();
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
  if (!ffmpegPath) {
    throw new Error("此平台不支持 Echo 的本地媒体处理");
  }
  const processing = new EchoProcessingService({
    allowedUploadOrigin: import.meta.env.VITE_RECORDING_R2_UPLOAD_ORIGIN ?? "",
    artifactRoot: join(userDataRoot, "meeting-processing"),
    client: new EchoServerClient({
      deviceId: await loadEchoDeviceId(join(userDataRoot, "default-profile", "echo-device-id")),
      fetch: (url, options) => session.defaultSession.fetch(url, options),
      origin: import.meta.env.VITE_BETTER_AUTH_URL,
    }),
    database: localDatabase,
    ffmpegBin: ffmpegPath.replace(/app\.asar([\\/])/, "app.asar.unpacked$1"),
    recordings: meetingCaptureStore,
  });
  app.on("before-quit", () => {
    prepareMainWindowQuit();
    processing.stop();
  });
  app.once("will-quit", () => localDatabase.close());
  powerMonitor.on("suspend", () => processing.stop());
  powerMonitor.on("resume", () => processing.resume());
  registerEchoProcessingIpc(processing);
  registerMeetingCaptureIpc(meetingCaptureStore, processing);
  try {
    await processing.start();
  } catch (error) {
    captureDesktopMainException(error, "echo.processing-start");
  }
  tray = new Tray(nativeImage.createFromPath(macIcon).resize({ height: 18, width: 18 }));
  tray.setToolTip("Echo");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { click: handleActivate, label: "打开 Echo" },
      { type: "separator" },
      { click: () => app.quit(), label: "退出 Echo" },
    ]),
  );
  tray.on("click", handleActivate);
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
