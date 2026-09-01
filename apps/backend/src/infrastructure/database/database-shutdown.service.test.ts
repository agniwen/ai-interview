import { describe, expect, it, vi } from "vitest";
import { DatabaseShutdownService } from "./database-shutdown.service.js";

describe("DatabaseShutdownService", () => {
  it("registers both pools after background draining", async () => {
    const api = { close: vi.fn(async () => {}) };
    const background = { close: vi.fn(async () => {}) };
    const coordinator = { register: vi.fn() };

    // SAFETY: the focused fakes implement the only close/register methods used by this service.
    const service = new DatabaseShutdownService(
      api as never,
      background as never,
      coordinator as never,
    );

    expect(service).toBeInstanceOf(DatabaseShutdownService);
    expect(coordinator.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: "database-pools", order: 900 }),
    );
    const participant = coordinator.register.mock.calls[0]?.[0];
    await participant?.drain();
    expect(api.close).toHaveBeenCalledOnce();
    expect(background.close).toHaveBeenCalledOnce();
  });
});
