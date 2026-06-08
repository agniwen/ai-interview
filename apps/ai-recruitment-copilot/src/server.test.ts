import { afterEach, describe, expect, it, vi } from "vitest";

const startFetch = vi.fn(() => Promise.resolve(new Response("start")));
const honoFetch = vi.fn(() => Promise.resolve(new Response("hono")));
const createServerApp = vi.fn(() => ({
  fetch: honoFetch,
}));
const handleORPCRequest = vi.fn(() =>
  Promise.resolve({ matched: true, response: new Response("orpc") }),
);

vi.mock("@tanstack/react-start/server-entry", () => ({
  createServerEntry: (entry: unknown) => entry,
  default: {
    fetch: startFetch,
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/app", () => ({
  createServerApp,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/orpc/handler", () => ({
  handleORPCRequest,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("TanStack Start server entry", () => {
  it("serves the process health endpoint before loading API routers", async () => {
    const serverModule = await import("./server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/api/health");

    const response = await entry.fetch(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(createServerApp).not.toHaveBeenCalled();
    expect(handleORPCRequest).not.toHaveBeenCalled();
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("routes /api/rpc requests to oRPC before loading the full Hono app", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const serverModule = await import("./server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/api/rpc/health");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("orpc");
    expect(handleORPCRequest).toHaveBeenCalledWith(request, { session: null, user: null });
    expect(createServerApp).not.toHaveBeenCalled();
    expect(honoFetch).not.toHaveBeenCalled();
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("routes /api requests to the Hono app", async () => {
    const serverModule = await import("./server");
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
    const serverModule = await import("./server");
    const entry = serverModule.default;
    const request = new Request("https://example.test/login");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
  });
});
