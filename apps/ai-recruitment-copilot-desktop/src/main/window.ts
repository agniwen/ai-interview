import { is } from "@electron-toolkit/utils";
import { BrowserWindow, shell } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import icon from "../../resources/icon.png?asset";

const mainDir = import.meta.dirname;

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

function platformWindowOptions(): BrowserWindowConstructorOptions {
  if (isMac) {
    return {
      // Transparent surface is required for vibrancy to composite the
      // desktop under empty (non-opaque) HTML regions.
      backgroundColor: "#00000000",
      titleBarStyle: "hiddenInset",
      // Traffic lights center on the ~38px chrome band — keep in sync with
      // TITLE_BAR_HEIGHT_PX in renderer `components/layout/chrome.ts`.
      trafficLightPosition: { x: 16, y: 13 },
      transparent: true,
      // `under-window` blurs desktop / windows behind this window.
      // `sidebar` alone is subtler and often looks flat if any opaque
      // layer still fills the sidebar strip.
      vibrancy: "under-window",
      visualEffectState: "active",
    };
  }

  if (isWin) {
    return {
      backgroundColor: "#00000000",
      backgroundMaterial: "acrylic",
      frame: false,
      icon,
      transparent: true,
    };
  }

  // Linux: no stable system acrylic; solid fallback.
  return {
    backgroundColor: "#ffffff",
    frame: false,
    ...(process.platform === "linux" ? { icon } : {}),
  };
}

/**
 * Native desktop material (macOS vibrancy / Windows acrylic).
 *
 * Correct stack (must all hold or glass will look solid):
 * 1. Window: transparent + backgroundColor #00000000 + vibrancy
 * 2. html/body/#root: CSS background transparent
 * 3. Sidebar: mostly transparent wash only (no opaque fill)
 * 4. Content: opaque, positioned with margin (not padding) so it does NOT
 *    paint under the sidebar — otherwise the glass only blurs solid white
 *
 * @see https://www.electronjs.org/docs/latest/api/browser-window#winsetvibrancytype
 */
export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    height: 720,
    minHeight: 480,
    minWidth: 800,
    show: false,
    webPreferences: {
      preload: join(mainDir, "../preload/index.js"),
      sandbox: false,
      spellcheck: false,
    },
    width: 1100,
    ...platformWindowOptions(),
  });

  mainWindow.on("ready-to-show", () => {
    // Re-assert material after first paint — avoids white flash / lost vibrancy
    // on some Electron + macOS combinations.
    if (isMac) {
      mainWindow.setBackgroundColor("#00000000");
      mainWindow.setVibrancy("under-window");
    } else if (isWin) {
      mainWindow.setBackgroundColor("#00000000");
      try {
        mainWindow.setBackgroundMaterial("acrylic");
      } catch {
        // Older Windows builds may not support acrylic.
      }
    }
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
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
