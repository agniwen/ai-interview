export type OAuthOpenResult =
  | { ok: true; reason: "success" | "closed" }
  | { ok: false; reason: "error"; message: string };

export interface AuthApi {
  /**
   * Start Feishu (or other generic OAuth) in a child BrowserWindow.
   * Sign-in is initiated first-party on the auth host so state cookies stick.
   */
  openOAuth: (input: {
    authBaseURL: string;
    authApiOrigin: string;
    appOrigin: string;
    providerId: string;
    callbackURL: string;
    errorCallbackURL: string;
  }) => Promise<OAuthOpenResult>;
}
