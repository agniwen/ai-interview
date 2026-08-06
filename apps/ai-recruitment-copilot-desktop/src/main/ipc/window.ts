import { BrowserWindow, ipcMain } from "electron";

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerWindowIpc(): void {
  ipcMain.handle("window:minimize", (event) => {
    windowFromEvent(event)?.minimize();
  });

  ipcMain.handle("window:maximize", (event) => {
    const win = windowFromEvent(event);
    if (!win) {
      return false;
    }
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  ipcMain.handle("window:close", (event) => {
    windowFromEvent(event)?.close();
  });

  ipcMain.handle("window:is-maximized", (event) => windowFromEvent(event)?.isMaximized() ?? false);
}
