import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../client";
afterEach(() => vi.unstubAllGlobals());
describe("API error responses", () => {
  it("hides gateway HTML while preserving status and request identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><h1>502 Bad Gateway</h1><center>stgw</center></html>", {
          headers: { "content-type": "text/html", "x-request-id": "request-1" },
          status: 502,
        }),
      ),
    );
    await expect(apiFetch("/api/upload")).rejects.toMatchObject({
      message: expect.not.stringContaining("<html>"),
      requestId: "request-1",
      status: 502,
    });
  });
  it("keeps actionable business errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "简历文件不能超过 20 MB。" }, { status: 400 })),
    );
    await expect(apiFetch("/api/upload")).rejects.toMatchObject({
      message: "简历文件不能超过 20 MB。",
      status: 400,
    });
  });
  it("preserves cancellation instead of reporting a network failure", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));
    await expect(apiFetch("/api/upload", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
