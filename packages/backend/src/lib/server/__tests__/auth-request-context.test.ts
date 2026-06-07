import { describe, expect, it } from "vitest";
import {
  getAuthRequestHeaders,
  runWithAuthRequestHeaders,
} from "@arc/backend/lib/server/auth-request-context";

describe("auth request context", () => {
  it("returns undefined outside an auth request scope", () => {
    expect(getAuthRequestHeaders()).toBeUndefined();
  });

  it("keeps request headers available across async work inside the scope", async () => {
    const headers = new Headers({ cookie: "better-auth.session_token=token-1" });

    const cookie = await runWithAuthRequestHeaders(headers, async () => {
      await Promise.resolve();
      return getAuthRequestHeaders()?.get("cookie");
    });

    expect(cookie).toBe("better-auth.session_token=token-1");
    expect(getAuthRequestHeaders()).toBeUndefined();
  });
});
