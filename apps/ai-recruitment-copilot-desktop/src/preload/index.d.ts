import type { ElectronAPI } from "@electron-toolkit/preload";
import type { WindowApi } from "./window-api";

declare global {
  interface Window {
    api: {
      window: WindowApi;
    };
    electron: ElectronAPI;
  }
}

export type { WindowApi };
