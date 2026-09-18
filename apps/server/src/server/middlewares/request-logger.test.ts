import { expect, it } from "vitest";
import { safeRequestPath } from "./request-logger";
it("redacts interview capability tokens and all query secrets", () => {
  expect(
    safeRequestPath(
      "http://localhost/api/public/human-interview-meetings/interviewer/private.token/review?token=secret",
    ),
  ).toBe("/api/public/human-interview-meetings/interviewer/[redacted]/review");
});
