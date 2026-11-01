import { describe, expect, it, vi } from "vitest";

import { createInterviewTokenLifecycle } from "../interview-token-lifecycle";

describe("interview token lifecycle", () => {
  it("refreshes tokens for starts and recoverable disconnects", async () => {
    const request = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("reconnect");
    const lifecycle = createInterviewTokenLifecycle(request);
    expect(await lifecycle.fetch()).toBe("first");
    expect(await lifecycle.fetch()).toBe("reconnect");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not request tokens during SDK cleanup after a terminal end", async () => {
    const request = vi.fn().mockResolvedValue("connected-token");
    const lifecycle = createInterviewTokenLifecycle(request);
    await lifecycle.fetch();
    lifecycle.end();
    expect(await lifecycle.fetch()).toBe("connected-token");
    expect(await lifecycle.fetch()).toBe("connected-token");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects an ended session that never acquired credentials without making a request", async () => {
    const request = vi.fn();
    const lifecycle = createInterviewTokenLifecycle(request);
    lifecycle.end();
    await expect(lifecycle.fetch()).rejects.toThrow("interview has ended");
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves real token errors and allows retry before the interview ends", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue("retry");
    const lifecycle = createInterviewTokenLifecycle(request);
    await expect(lifecycle.fetch()).rejects.toThrow("network");
    expect(await lifecycle.fetch()).toBe("retry");
  });
});
