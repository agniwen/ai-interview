export type OAuthOpenResult =
  | { ok: true; reason: "success" | "closed" }
  | { ok: false; reason: "error"; message: string };

export interface AuthApi {
  openOAuth: (url: string, successUrl: string) => Promise<OAuthOpenResult>;
}
