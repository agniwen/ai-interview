import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import macIcon from "../../resources/icon-mac.png?asset";
import { registerContextMenu } from "./context-menu";
import { registerOrpcIpc } from "./orpc";
import { applySettingsAtStartup } from "./settings";
import { registerAuthIpc } from "./ipc/auth";
import { registerWindowIpc } from "./ipc/window";
import {
  registerMeetingCaptureIpc,
  registerMeetingCaptureMediaSession,
} from "./meeting-capture/ipc";
import { LocalMeetingRecordingStore } from "./meeting-capture/local-meeting-recording-store";
import { createMainWindow, getMainWindowWebContents } from "./window";

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
  if (process.platform === "darwin") {
    app.dock?.setIcon(macIcon);
  }

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  applySettingsAtStartup();
  registerContextMenu();
  const meetingCaptureStore = new LocalMeetingRecordingStore(
    join(app.getPath("userData"), "meeting-capture", "default-profile"),
  );
  registerMeetingCaptureIpc(meetingCaptureStore);
  registerMeetingCaptureMediaSession();
  registerOrpcIpc();
  registerWindowIpc();
  registerAuthIpc();
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
