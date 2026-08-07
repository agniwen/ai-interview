import type { ElectronAPI } from "@electron-toolkit/preload";
import type { AuthApi } from "./auth-api";
import type { WindowApi } from "./window-api";

declare global {
  interface Window {
    api: {
      auth: AuthApi;
      window: WindowApi;
    };
    electron: ElectronAPI;
  }
}

export type { AuthApi, WindowApi };
