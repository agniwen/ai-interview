import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { requestLogger, safeRequestPath } from "./request-logger";
it("redacts interview capability tokens and all query secrets", () => {
  expect(
    safeRequestPath(
      "http://localhost/api/public/human-interview-meetings/interviewer/private.token/review?token=secret",
    ),
  ).toBe("/api/public/human-interview-meetings/interviewer/[redacted]/review");
});

it.each(["", "/resume-1", "/resume-1/interview-questions", "/resume-1/ai-evaluation"])(
  "redacts candidate materials capabilities before logging %s",
  async (suffix) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const app = new Hono();
      app.use(requestLogger);
      app.get("*", (c) => c.text("ok"));
      await app.request(
        `/api/public/human-interview-candidate-materials/private.token${suffix}?key=secret`,
      );
      expect(log).toHaveBeenCalledWith(
        "request",
        expect.objectContaining({
          path: `/api/public/human-interview-candidate-materials/[redacted]${suffix}`,
          status: 200,
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain("private.token");
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    } finally {
      log.mockRestore();
    }
  },
);

it("preserves participant route names while hiding their capabilities", () => {
  expect(safeRequestPath("/api/public/human-interview-meetings/candidate/private.token")).toBe(
    "/api/public/human-interview-meetings/candidate/[redacted]",
  );
});
