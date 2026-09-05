import { testClient } from "hono/testing";
import { describe, expect, it, vi } from "vitest";
import { factory } from "../../../../factory";
import { createMeetingLiveSummaryRouter } from "./route";
import type { MeetingLiveSummaryRouterDependencies } from "./route";

const request = {
  baseSnapshot: null,
  captureId: "00000000-0000-4000-8000-000000000072",
  template: "general" as const,
  turns: [
    {
      endMs: 8000,
      final: true as const,
      id: "turn-1",
      speakerDisplayName: "说话人1",
      speakerKey: "remote-1",
      startMs: 2000,
      text: "讨论支付系统重构。",
      track: "system" as const,
    },
  ],
};

const response = {
  captureId: request.captureId,
  coveredThroughMs: 8000,
  coveredThroughTurnId: "turn-1",
  generatedAt: "2026-09-04T03:00:00.000Z",
  model: "test-model",
  provider: "test-provider",
  revision: 1,
  summary: "讨论支付系统。",
  template: "general" as const,
  topics: [
    {
      endMs: 8000,
      evidenceTurnIds: ["turn-1"],
      id: "topic-1",
      points: [],
      startMs: 2000,
      status: "active" as const,
      summary: "讨论重构。",
      title: "支付系统",
    },
  ],
};

function client(generate: MeetingLiveSummaryRouterDependencies["generate"]) {
  const router = createMeetingLiveSummaryRouter({ generate });
  const app = factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: Route tests install the minimal authenticated organization fixture expected by middleware.
      c.set("activeOrg", { id: "org-1", name: "Org", slug: "org" } as never);
      // SAFETY: Route tests install the minimal authenticated member fixture expected by middleware.
      c.set("member", { role: "member" } as never);
      // SAFETY: Route tests install the minimal authenticated user fixture expected by middleware.
      c.set("user", { id: "user-1" } as never);
      await next();
    })
    .route("/live-summary", router);
  return testClient(app);
}

describe("meeting live summary route", () => {
  it("returns a no-store summary for an authenticated workspace member", async () => {
    const generate = vi.fn().mockResolvedValue(response);
    const result = await client(generate)["live-summary"].$post({ json: request });

    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    await expect(result.json()).resolves.toMatchObject({ revision: 1, summary: "讨论支付系统。" });
    expect(generate).toHaveBeenCalledWith(request);
  });

  it("keeps model failures generic and retryable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await client(vi.fn().mockRejectedValue(new Error("provider secret")))[
      "live-summary"
    ].$post({ json: request });

    expect(result.status).toBe(503);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    await expect(result.json()).resolves.toEqual({ error: "AI 实时总结暂时不可用，录音仍在继续" });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
