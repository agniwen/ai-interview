import { describe, expect, it } from "vitest";
import { resolveForcedPageTheme } from "./fixed-page-theme";

describe("fixed page theme", () => {
  it.each(["/human-interview/invite-token", "/human-interview/interviewer/invite-token"])(
    "forces dark mode for %s",
    (pathname) => {
      expect(resolveForcedPageTheme(pathname)).toBe("dark");
    },
  );

  it.each(["/", "/w/example/studio", "/human-interviews"])(
    "preserves the user theme for %s",
    (pathname) => {
      expect(resolveForcedPageTheme(pathname)).toBeUndefined();
    },
  );
});
