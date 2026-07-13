// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fetchLatestBuildTime, isStaleClient } from "../app-version";

describe("app version checks", () => {
  it("treats a different deployed build as a stale client", () => {
    expect(isStaleClient("2026-07-13T10:05:00.000Z", "2026-07-13T09:00:00.000Z")).toBe(true);
    expect(isStaleClient("2026-07-13T10:05:00.000Z", "2026-07-13T10:05:00.000Z")).toBe(false);
  });

  it("fetches the uncached deployed build time", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ buildTime: "2026-07-13T10:05:00.000Z" }));

    await expect(fetchLatestBuildTime(fetcher)).resolves.toBe("2026-07-13T10:05:00.000Z");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/app-version",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects malformed responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ version: "missing" }));

    await expect(fetchLatestBuildTime(fetcher)).rejects.toThrow(
      "Version check returned an invalid response",
    );
  });
});
