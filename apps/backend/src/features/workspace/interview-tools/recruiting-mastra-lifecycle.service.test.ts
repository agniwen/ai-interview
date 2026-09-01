import { PostgresStore } from "@mastra/pg";
import { describe, expect, it, vi } from "vitest";

import { DRAIN_ORDER } from "../../../runtime/drain-coordinator.service.js";
import { closeRecruitingMastraStorage, getRecruitingMastra } from "./recruiting-copilot.js";
import {
  createRecruitingMastraDrainParticipant,
  RecruitingMastraLifecycleService,
} from "./recruiting-mastra-lifecycle.service.js";

describe("RecruitingMastraLifecycleService", () => {
  it("registers Mastra storage in the database drain phase", () => {
    const coordinator = { register: vi.fn() };

    // SAFETY: the narrow fake implements the only coordinator method used by the provider.
    const lifecycle = new RecruitingMastraLifecycleService(coordinator as never);

    expect(lifecycle).toBeInstanceOf(RecruitingMastraLifecycleService);
    expect(coordinator.register).toHaveBeenCalledOnce();
    expect(coordinator.register).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "mastra-postgres",
        order: DRAIN_ORDER.database,
      }),
    );
  });

  it("delegates draining to the owned PostgresStore closer", async () => {
    const close = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const participant = createRecruitingMastraDrainParticipant(close);

    await participant.drain();

    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the singleton PostgresStore exactly once", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/test";
    const close = vi
      .spyOn(PostgresStore.prototype, "close")
      .mockImplementation(() => Promise.resolve());

    try {
      getRecruitingMastra();
      await Promise.all([closeRecruitingMastraStorage(), closeRecruitingMastraStorage()]);

      expect(close).toHaveBeenCalledOnce();
    } finally {
      await closeRecruitingMastraStorage();
      close.mockRestore();
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });
});
