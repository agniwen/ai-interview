import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import type { AuthApi } from "./auth-api";
import type { WindowApi } from "./window-api";

/**
 * oRPC MessageChannel handoff: the renderer creates a MessageChannel and
 * posts one port through the window; we forward it to the main process where
 * the oRPC `RPCHandler` upgrades it. See `src/renderer/src/lib/orpc.ts`.
 */
window.addEventListener("message", (event) => {
  if (event.data === "start-orpc-client") {
    const [serverPort] = event.ports;
    ipcRenderer.postMessage("start-orpc-server", null, [serverPort]);
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
  openOAuth: (url, successUrl) => ipcRenderer.invoke("auth:open-oauth", { successUrl, url }),
};

const api = {
  auth: authApi,
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
