import { BrowserWindow, ipcMain } from "electron";

export type OAuthOpenResult =
  | { ok: true; reason: "success" | "closed" }
  | { ok: false; reason: "error"; message: string };

export interface OAuthOpenPayload {
  /** better-auth base URL, e.g. https://interview.chainthink.cn or …/api/auth */
  authBaseURL: string;
  authApiOrigin: string;
  appOrigin: string;
  providerId: string;
  callbackURL: string;
  errorCallbackURL: string;
}

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Resolve sign-in endpoint from VITE_BETTER_AUTH_URL-style base. */
function oauth2SignInUrl(authBaseURL: string): string {
  const base = authBaseURL.replace(/\/+$/, "");
  if (base.endsWith("/api/auth")) {
    return `${base}/sign-in/oauth2`;
  }
  return `${base}/api/auth/sign-in/oauth2`;
}

/** Extract error code from query or hash (`#/login?error=feishu`). */
function extractErrorCode(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) {
    return null;
  }

  const fromQuery = parsed.searchParams.get("error");
  if (fromQuery) {
    return fromQuery;
  }

  // Hash router: http://host/#/login?error=feishu
  const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) {
    return null;
  }
  return new URLSearchParams(hash.slice(qIndex + 1)).get("error");
}

function isSuccessNavigation(url: string, successUrl: string, appOrigin: string): boolean {
  const target = parseUrl(url);
  if (!target) {
    return url.includes("/auth/callback");
  }

  let successOrigin = appOrigin;
  try {
    successOrigin = new URL(successUrl).origin;
  } catch {
    // keep appOrigin
  }

  if (target.origin !== successOrigin) {
    return false;
  }

  if (target.hash.includes("/auth/callback") || target.pathname.includes("/auth/callback")) {
    return true;
  }

  return false;
}

function isAppErrorCallback(url: string, appOrigin: string): boolean {
  const target = parseUrl(url);
  if (!target || target.origin !== appOrigin) {
    return false;
  }
  const onLogin = target.hash.includes("/login") || target.pathname.includes("/login");
  return onLogin && extractErrorCode(url) !== null;
}

/** Production onAPIError.errorURL is `/login` on the auth host. */
function isAuthHostErrorPage(url: string, authApiOrigin: string): boolean {
  const target = parseUrl(url);
  if (!target || target.origin !== authApiOrigin) {
    return false;
  }
  const code = extractErrorCode(url);
  if (!code) {
    return false;
  }
  // Avoid treating unrelated query strings on the marketing site as auth errors.
  return (
    target.pathname === "/login" ||
    target.pathname.endsWith("/login") ||
    target.pathname.includes("/api/auth/error") ||
    target.pathname.includes("/error")
  );
}

function humanizeOAuthError(code: string): string {
  switch (code) {
    case "access_denied": {
      return "已取消飞书授权";
    }
    case "feishu":
    case "feishu-jiguang-hr": {
      return "飞书登录失败，请重试";
    }
    case "please_restart_the_process":
    case "state_mismatch": {
      return "登录状态已失效，请关闭窗口后重试（OAuth state）";
    }
    case "invalid_code":
    case "oauth_code_verification_failed":
    case "oAuth_code_missing":
    case "no_code": {
      return "飞书授权码无效，请重试";
    }
    case "invalid_origin":
    case "INVALID_ORIGIN": {
      return "来源未受信任，请确认后端 trustedOrigins 已包含桌面地址";
    }
    case "invalid_callback_url":
    case "INVALID_CALLBACK_URL": {
      return "回调地址无效，请检查 VITE_BASE_URL 与 trustedOrigins";
    }
    case "banned": {
      return "账号已被禁用";
    }
    default: {
      return `登录失败（${code}）`;
    }
  }
}

/**
 * better-auth sets SameSite=Lax session cookies. Renderer at localhost cannot
 * send those on cross-origin fetch to the auth host. Rewrite to None so the
 * shared Electron session can use them for credentials:include calls.
 */
async function relaxAuthCookiesForDesktop(
  ses: Electron.Session,
  authApiOrigin: string,
): Promise<void> {
  const cookies = await ses.cookies.get({ url: authApiOrigin });
  await Promise.all(
    cookies
      .filter((cookie) => cookie.name.includes("better-auth"))
      .map(async (cookie) => {
        try {
          await ses.cookies.set({
            domain: cookie.domain,
            expirationDate: cookie.expirationDate,
            httpOnly: cookie.httpOnly,
            name: cookie.name,
            path: cookie.path || "/",
            sameSite: "no_restriction",
            secure: true,
            url: authApiOrigin,
            value: cookie.value,
          });
        } catch {
          // Cookie rewrite is best-effort; login may still work for top-level nav.
        }
      }),
  );
}

/**
 * Start OAuth **inside** the auth BrowserWindow as a first-party request so
 * `__Secure-better-auth.state` is stored for the auth host. Starting the flow
 * via cross-origin fetch from localhost often drops that cookie, and the
 * Feishu callback then redirects with `please_restart_the_process`.
 */
async function beginOAuthInWindow(
  authWin: BrowserWindow,
  payload: OAuthOpenPayload,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const signInUrl = oauth2SignInUrl(payload.authBaseURL);

  try {
    await authWin.loadURL(payload.authApiOrigin);
  } catch {
    return {
      message: `无法打开认证站点 ${payload.authApiOrigin}`,
      ok: false,
    };
  }

  if (authWin.isDestroyed()) {
    return { message: "登录窗口已关闭", ok: false };
  }

  const script = `
    (async () => {
      const res = await fetch(${JSON.stringify(signInUrl)}, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: ${JSON.stringify(payload.providerId)},
          callbackURL: ${JSON.stringify(payload.callbackURL)},
          errorCallbackURL: ${JSON.stringify(payload.errorCallbackURL)},
          disableRedirect: true,
        }),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      return { status: res.status, data };
    })()
  `;

  interface SignInResult {
    status: number;
    data: { url?: string; message?: string; raw?: string } | null;
  }

  let result: SignInResult;
  try {
    result = (await authWin.webContents.executeJavaScript(script)) as SignInResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "发起登录请求失败";
    return { message, ok: false };
  }

  if (result.status === 403) {
    return {
      message: "来源未受信任（403），请确认后端 trustedOrigins 包含桌面地址",
      ok: false,
    };
  }

  const oauthUrl = result.data?.url;
  if (result.status < 200 || result.status >= 300 || !oauthUrl || typeof oauthUrl !== "string") {
    const detail =
      result.data?.message ||
      (typeof result.data?.raw === "string" ? result.data.raw.slice(0, 120) : null) ||
      `HTTP ${result.status}`;
    return { message: `未能获取飞书授权地址：${detail}`, ok: false };
  }

  return { ok: true, url: oauthUrl };
}

function openOAuthWindow(
  parent: BrowserWindow,
  payload: OAuthOpenPayload,
): Promise<OAuthOpenResult> {
  const { authApiOrigin, appOrigin, callbackURL } = payload;

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

  // eslint-disable-next-line promise/avoid-new -- BrowserWindow navigation is event-based
  return new Promise<OAuthOpenResult>((resolve) => {
    let settled = false;
    let sawAuthApi = false;
    let watching = false;

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

    const completeSuccess = async () => {
      try {
        await relaxAuthCookiesForDesktop(parent.webContents.session, authApiOrigin);
      } catch {
        // best-effort cookie rewrite
      }
      finish({ ok: true, reason: "success" });
    };

    const handleNavigate = (_event: Electron.Event, navigationUrl: string) => {
      if (!watching) {
        return;
      }

      const parsed = parseUrl(navigationUrl);
      if (parsed && parsed.origin === authApiOrigin) {
        sawAuthApi = true;
      }

      if (isAppErrorCallback(navigationUrl, appOrigin)) {
        const code = extractErrorCode(navigationUrl) ?? "unknown";
        finish({
          message: humanizeOAuthError(code),
          ok: false,
          reason: "error",
        });
        return;
      }

      if (isAuthHostErrorPage(navigationUrl, authApiOrigin)) {
        const code = extractErrorCode(navigationUrl) ?? "unknown";
        finish({
          message: humanizeOAuthError(code),
          ok: false,
          reason: "error",
        });
        return;
      }

      // Provider returned error to the better-auth callback endpoint.
      if (
        parsed &&
        parsed.origin === authApiOrigin &&
        parsed.pathname.includes("/callback") &&
        parsed.searchParams.has("error")
      ) {
        const code = parsed.searchParams.get("error") ?? "unknown";
        finish({
          message: humanizeOAuthError(code),
          ok: false,
          reason: "error",
        });
        return;
      }

      if (isSuccessNavigation(navigationUrl, callbackURL, appOrigin)) {
        void completeSuccess();
        return;
      }

      // After a round-trip through the auth API, landing back on the app origin
      // (even without the hash) usually means better-auth finished redirecting.
      if (
        sawAuthApi &&
        parsed &&
        parsed.origin === appOrigin &&
        !isAppErrorCallback(navigationUrl, appOrigin)
      ) {
        void completeSuccess();
      }
    };

    authWin.webContents.on("will-redirect", handleNavigate);
    authWin.webContents.on("will-navigate", handleNavigate);
    authWin.webContents.on("did-navigate", handleNavigate);
    authWin.webContents.on("did-navigate-in-page", handleNavigate);

    authWin.on("closed", () => {
      finish({ ok: true, reason: "closed" });
    });

    void (async () => {
      const started = await beginOAuthInWindow(authWin, payload);
      if (settled) {
        return;
      }
      if (!started.ok) {
        finish({ message: started.message, ok: false, reason: "error" });
        return;
      }

      watching = true;
      try {
        await authWin.loadURL(started.url);
      } catch {
        if (!settled) {
          finish({ message: "无法打开飞书授权页", ok: false, reason: "error" });
        }
      }
    })();
  });
}

/**
 * Open Feishu (or other) OAuth in a child window that shares the app session
 * so Set-Cookie from BETTER_AUTH_URL is visible to the main renderer.
 *
 * OAuth is **started** inside that window (first-party on the auth host) so the
 * better-auth state cookie is not dropped as a third-party cookie.
 */
export function registerAuthIpc(): void {
  ipcMain.handle(
    "auth:open-oauth",
    async (event, payload: OAuthOpenPayload): Promise<OAuthOpenResult> => {
      const parent = windowFromEvent(event);
      if (!parent) {
        return { message: "No parent window", ok: false, reason: "error" };
      }

      if (
        !payload ||
        typeof payload.authBaseURL !== "string" ||
        typeof payload.authApiOrigin !== "string" ||
        typeof payload.appOrigin !== "string" ||
        typeof payload.providerId !== "string" ||
        typeof payload.callbackURL !== "string" ||
        typeof payload.errorCallbackURL !== "string"
      ) {
        return { message: "Invalid OAuth payload", ok: false, reason: "error" };
      }

      return await openOAuthWindow(parent, payload);
    },
  );
}
