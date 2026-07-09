import { afterEach, describe, expect, it, vi } from "vitest";

const startFetch = vi.fn(() => Promise.resolve(new Response("start")));
const honoFetch = vi.fn(() => Promise.resolve(new Response("hono")));
const createOgImageResponse = vi.fn(
  () => new Response("og", { headers: { "Content-Type": "image/png" } }),
);
const createServerApp = vi.fn(() => ({
  fetch: honoFetch,
}));
const initializeFeishuBots = vi.fn(() => Promise.resolve());

vi.mock("@tanstack/react-start/server-entry", () => ({
  createServerEntry: (entry: unknown) => entry,
  default: {
    fetch: startFetch,
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/app", () => ({
  createServerApp,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/bot", () => ({
  initializeFeishuBots,
}));

vi.mock("../lib/server/og-image", () => ({
  createOgImageResponse,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("TanStack Start server entry", () => {
  it("serves the process health endpoint before loading API routers", async () => {
    const serverModule = await import("../server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/api/health");

    const response = await entry.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(createServerApp).not.toHaveBeenCalled();
    expect(initializeFeishuBots).not.toHaveBeenCalled();
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("routes /api/rpc requests to the Hono app", async () => {
    const serverModule = await import("../server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/api/rpc/health");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("hono");
    expect(honoFetch).toHaveBeenCalledWith(request);
    expect(createServerApp).toHaveBeenCalledTimes(1);
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("serves the Open Graph image before loading API routers", async () => {
    const serverModule = await import("../server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/og.png");

    const response = await entry.fetch(request);

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(await response.text()).toBe("og");
    expect(createOgImageResponse).toHaveBeenCalledTimes(1);
    expect(createServerApp).not.toHaveBeenCalled();
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("starts Feishu bot websocket connections once when enabled", async () => {
    vi.stubEnv("FEISHU_BOT_ENABLED", "true");
    const serverModule = await import("../server");
    const entry = serverModule.default;
    const first = new Request("https://example.test/api/rpc/health");
    const second = new Request("https://example.test/api/resume/models");

    await entry.fetch(first);
    await entry.fetch(second);

    expect(initializeFeishuBots).toHaveBeenCalledTimes(1);
  });

  it("routes /api requests to the Hono app", async () => {
    const serverModule = await import("../server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/api/resume/models");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("hono");
    expect(honoFetch).toHaveBeenCalledWith(request);
    expect(createServerApp).toHaveBeenCalledTimes(1);
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("routes non-api requests to the TanStack Start handler", async () => {
    const serverModule = await import("../server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/login");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
  });
});
