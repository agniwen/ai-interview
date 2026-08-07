import { BrowserWindow, ipcMain } from "electron";

export type OAuthOpenResult =
  | { ok: true; reason: "success" | "closed" }
  | { ok: false; reason: "error"; message: string };

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function isSuccessNavigation(url: string, successUrl: string): boolean {
  try {
    const target = new URL(url);
    const success = new URL(successUrl);
    if (target.origin !== success.origin) {
      return false;
    }
    if (target.hash.includes("/auth/callback")) {
      return true;
    }
    if (target.pathname.includes("/auth/callback")) {
      return true;
    }
    return false;
  } catch {
    return url.startsWith(successUrl) || url.includes("/auth/callback");
  }
}

function isErrorNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("error")) {
      return true;
    }
    return parsed.hash.includes("error=");
  } catch {
    return url.includes("error=") && url.includes("login");
  }
}

function openOAuthWindow(
  parent: BrowserWindow,
  url: string,
  successUrl: string,
): Promise<OAuthOpenResult> {
  const authWin = new BrowserWindow({
    height: 720,
    modal: true,
    parent,
    show: true,
    title: "登录",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Same session as the parent so auth cookies are shared with
      // the main renderer's fetch(credentials: "include").
      session: parent.webContents.session,
    },
    width: 480,
  });

  // Event-driven completion; Promise bridge is required for ipcMain.handle.
  // eslint-disable-next-line promise/avoid-new -- BrowserWindow navigation is event-based
  return new Promise<OAuthOpenResult>((resolve) => {
    let settled = false;
    const finish = (result: OAuthOpenResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!authWin.isDestroyed()) {
        authWin.close();
      }
      resolve(result);
    };

    const handleNavigate = (_event: Electron.Event, navigationUrl: string) => {
      if (isSuccessNavigation(navigationUrl, successUrl)) {
        finish({ ok: true, reason: "success" });
        return;
      }
      if (isErrorNavigation(navigationUrl) && navigationUrl.includes("error=")) {
        finish({
          message: "OAuth failed or was cancelled",
          ok: false,
          reason: "error",
        });
      }
    };

    authWin.webContents.on("will-redirect", handleNavigate);
    authWin.webContents.on("will-navigate", handleNavigate);
    authWin.webContents.on("did-navigate", handleNavigate);
    authWin.webContents.on("did-navigate-in-page", handleNavigate);

    authWin.on("closed", () => {
      finish({ ok: true, reason: "closed" });
    });

    void authWin.loadURL(url);
  });
}

/**
 * Open Feishu (or other) OAuth in a child window that shares the app session
 * partition so Set-Cookie from BETTER_AUTH_URL is visible to the main renderer.
 */
export function registerAuthIpc(): void {
  ipcMain.handle(
    "auth:open-oauth",
    async (event, payload: { url: string; successUrl: string }): Promise<OAuthOpenResult> => {
      const parent = windowFromEvent(event);
      if (!parent) {
        return { message: "No parent window", ok: false, reason: "error" };
      }

      const { url, successUrl } = payload;
      if (typeof url !== "string" || typeof successUrl !== "string") {
        return { message: "Invalid OAuth payload", ok: false, reason: "error" };
      }

      return await openOAuthWindow(parent, url, successUrl);
    },
  );
}
