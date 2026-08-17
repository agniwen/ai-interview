import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerEntryHandler } from "../server";
import type { ServerEntryDependencies } from "../server";

const startFetch = vi.fn((_request: Request) => Promise.resolve(new Response("start")));
const honoFetch = vi.fn((_request: Request) => Promise.resolve(new Response("hono")));
const createOgImageResponse = vi.fn(
  () => new Response("og", { headers: { "Content-Type": "image/png" } }),
);
const initializeFeishuBots = vi.fn(() => Promise.resolve());
const pingDatabase = vi.fn(() => Promise.resolve());
const getResumeParseQueueStats = vi.fn(() => Promise.resolve({ waiting: 0 }));
const isResumeParseQueueConfigured = vi.fn(() => false);
const createHonoApp = vi.fn(() => Promise.resolve({ fetch: honoFetch }));

function createTestEntry() {
  const dependencies: ServerEntryDependencies = {
    applyServerEnv: () => {},
    createHonoApp,
    createOgImageResponse,
    getEnv: (name) => process.env[name],
    getResumeParseQueueStats,
    initializeFeishuBots,
    isResumeParseQueueConfigured,
    pingDatabase,
    startFetch,
  };
  return createServerEntryHandler(dependencies);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("TanStack Start server entry", () => {
  it("serves the process health endpoint before loading API routers", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/health");

    const response = await entry.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(startFetch).not.toHaveBeenCalled();
    expect(initializeFeishuBots).not.toHaveBeenCalled();
  });

  it("reports ready after the Hono app and database are available", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/ready");

    const response = await entry.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(pingDatabase).toHaveBeenCalledTimes(1);
    expect(isResumeParseQueueConfigured).toHaveBeenCalledTimes(1);
    expect(getResumeParseQueueStats).not.toHaveBeenCalled();
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("checks Redis when the resume parse queue is configured", async () => {
    isResumeParseQueueConfigured.mockReturnValueOnce(true);
    const entry = createTestEntry();

    const response = await entry.fetch(new Request("https://example.test/api/ready"));

    expect(response.status).toBe(200);
    expect(getResumeParseQueueStats).toHaveBeenCalledTimes(1);
  });

  it("reports not ready without exposing dependency errors", async () => {
    const readinessError = new Error("database credentials leaked here");
    pingDatabase.mockRejectedValueOnce(readinessError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const entry = createTestEntry();

    const response = await entry.fetch(new Request("https://example.test/api/ready"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(consoleError).toHaveBeenCalledWith("[web] readiness check failed", readinessError);
  });

  it("routes /api/rpc requests to the Hono app", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/rpc/health");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("hono");
    expect(honoFetch).toHaveBeenCalledWith(request);
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("routes /api/app-version to TanStack Start", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/app-version");

    const response = await entry.fetch(request);

    expect(await response.text()).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
    expect(honoFetch).not.toHaveBeenCalled();
  });

  it("serves the Open Graph image before loading API routers", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/og.png");

    const response = await entry.fetch(request);

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(await response.text()).toBe("og");
    expect(createOgImageResponse).toHaveBeenCalledTimes(1);
    expect(honoFetch).not.toHaveBeenCalled();
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("starts Feishu bot websocket connections once when enabled", async () => {
    vi.stubEnv("FEISHU_BOT_ENABLED", "true");
    const entry = createTestEntry();
    const first = new Request("https://example.test/api/rpc/health");
    const second = new Request("https://example.test/api/resume/models");

    await entry.fetch(first);
    await entry.fetch(second);

    expect(initializeFeishuBots).toHaveBeenCalledTimes(1);
  });

  it("starts Feishu websocket connections when human interview integration is enabled", async () => {
    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "true");
    const entry = createTestEntry();

    await entry.fetch(new Request("https://example.test/api/rpc/health"));

    expect(initializeFeishuBots).toHaveBeenCalledTimes(1);
  });

  it("does not start Feishu bot websocket connections while prerendering", async () => {
    vi.stubEnv("FEISHU_BOT_ENABLED", "true");
    vi.stubEnv("TSS_PRERENDERING", "true");
    const entry = createTestEntry();

    await entry.fetch(new Request("https://example.test/"));
    expect(initializeFeishuBots).not.toHaveBeenCalled();
    expect(startFetch).toHaveBeenCalledTimes(1);
  });

  it("routes /api requests to the Hono app", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/resume/models");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("hono");
    expect(honoFetch).toHaveBeenCalledWith(request);
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("routes non-api requests to the TanStack Start handler", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/login");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
  });
});
