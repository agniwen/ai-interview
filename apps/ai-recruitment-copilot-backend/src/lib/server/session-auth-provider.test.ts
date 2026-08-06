import { describe, expect, it } from "vitest";
import { resolveSessionAuthProviderId } from "./session-auth-provider";

describe("resolveSessionAuthProviderId", () => {
  it("uses route params when Better Auth exposes a parameterized callback path", () => {
    expect(resolveSessionAuthProviderId({ params: { id: "google" }, path: "/callback/:id" })).toBe(
      "google",
    );
    expect(
      resolveSessionAuthProviderId({
        params: { providerId: "feishu-jiguang-hr" },
        path: "/oauth2/callback/:providerId",
      }),
    ).toBe("feishu-jiguang-hr");
  });

  it("supports concrete callback paths and email credentials", () => {
    expect(resolveSessionAuthProviderId({ path: "/oauth2/callback/feishu" })).toBe("feishu");
    expect(resolveSessionAuthProviderId({ path: "/sign-in/email" })).toBe("credential");
    expect(resolveSessionAuthProviderId({ path: "/get-session" })).toBeNull();
  });
});
