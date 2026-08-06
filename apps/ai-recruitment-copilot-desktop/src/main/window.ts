import { is } from "@electron-toolkit/utils";
import { BrowserWindow, shell } from "electron";
import { join } from "node:path";
import icon from "../../resources/icon.png?asset";

const mainDir = import.meta.dirname;

const isMac = process.platform === "darwin";

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    height: 720,
    minHeight: 480,
    minWidth: 800,
    show: false,
    // macOS: hide system title text but keep traffic lights (Cursor-style).
    // Windows/Linux: frameless so we draw our own controls.
    ...(isMac
      ? {
          // Traffic lights ~12px tall; y centers them in the 35px custom title bar.
          // Keep in sync with TITLE_BAR_HEIGHT_PX + title-bar leading pad.
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 12 },
        }
      : {
          frame: false,
        }),
    webPreferences: {
      preload: join(mainDir, "../preload/index.js"),
      sandbox: false,
    },
    width: 1100,
    ...(process.platform === "linux" ? { icon } : {}),
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  const emitMaximized = (): void => {
    mainWindow.webContents.send("window:maximized-changed", mainWindow.isMaximized());
  };

  mainWindow.on("maximize", emitMaximized);
  mainWindow.on("unmaximize", emitMaximized);

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(mainDir, "../renderer/index.html"));
  }

  return mainWindow;
}
