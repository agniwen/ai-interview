import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import { registerWindowIpc } from "./ipc/window";
import { createMainWindow } from "./window";

function handleActivate(): void {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  electronApp.setAppUserModelId("com.arc.ai-recruitment-copilot-desktop");

  app.on("browser-window-created", (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerWindowIpc();
  createMainWindow();
  app.on("activate", handleActivate);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void bootstrap();
