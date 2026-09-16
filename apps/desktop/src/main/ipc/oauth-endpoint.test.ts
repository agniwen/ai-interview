import { describe, expect, it } from "vitest";
import { desktopOAuthEndpoint } from "./oauth-endpoint";

describe("desktop OAuth operations", () => {
  it.each(["https://auth.example.com", "https://auth.example.com/api/auth/"])(
    "%s uses explicit linking without changing ordinary sign-in",
    (base) => {
      expect(desktopOAuthEndpoint(base)).toBe("https://auth.example.com/api/auth/sign-in/social");
      expect(desktopOAuthEndpoint(base, "link")).toBe(
        "https://auth.example.com/api/auth/link-social",
      );
    },
  );
});
