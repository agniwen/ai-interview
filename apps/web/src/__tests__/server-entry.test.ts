import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerEntryHandler } from "../server";
import type { ServerEntryDependencies } from "../server";
import { getLocale } from "../paraglide/runtime";

const startFetch = vi.fn((_request: Request) => Promise.resolve(new Response("start")));
const createOgImageResponse = vi.fn(
  () => new Response("og", { headers: { "Content-Type": "image/png" } }),
);

function createTestEntry() {
  const dependencies: ServerEntryDependencies = {
    applyServerEnv: () => {},
    createOgImageResponse,
    startFetch,
  };
  return createServerEntryHandler(dependencies);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("TanStack Start server entry", () => {
  it("routes /api/app-version to TanStack Start", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/app-version");

    const response = await entry.fetch(request);

    expect(await response.text()).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
  });

  it("serves the Open Graph image before loading API routers", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/og.png");

    const response = await entry.fetch(request);

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(await response.text()).toBe("og");
    expect(createOgImageResponse).toHaveBeenCalledTimes(1);
    expect(startFetch).not.toHaveBeenCalled();
  });

  it("does not retain the legacy API mount", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/api/resume/models");

    const response = await entry.fetch(request);

    expect(await response.text()).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
  });

  it("routes non-api requests to the TanStack Start handler", async () => {
    const entry = createTestEntry();
    const request = new Request("https://example.test/login");

    const response = await entry.fetch(request);
    const text = await response.text();

    expect(text).toBe("start");
    expect(startFetch).toHaveBeenCalledWith(request);
  });

  it.each(["en", "ja", "ko"] as const)(
    "uses the %s locale cookie on the public login route without changing its path",
    async (locale) => {
      startFetch.mockImplementationOnce((request) =>
        Promise.resolve(new Response(`${getLocale()} ${new URL(request.url).pathname}`)),
      );
      const entry = createTestEntry();
      const request = new Request("https://example.test/login", {
        headers: { cookie: `ARC_LOCALE=${locale}` },
      });

      const response = await entry.fetch(request);

      expect(await response.text()).toBe(`${locale} /login`);
    },
  );

  it("keeps authenticated routes on the base locale even when the public locale cookie differs", async () => {
    startFetch.mockImplementationOnce((request) =>
      Promise.resolve(new Response(`${getLocale()} ${new URL(request.url).pathname}`)),
    );
    const entry = createTestEntry();
    const request = new Request("https://example.test/w/acme/studio", {
      headers: { cookie: "ARC_LOCALE=ja" },
    });

    const response = await entry.fetch(request);

    expect(await response.text()).toBe("zh-CN /w/acme/studio");
  });
});
