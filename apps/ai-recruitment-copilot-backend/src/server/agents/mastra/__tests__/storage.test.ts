import { describe, expect, it } from "vitest";
import { createMastraStorage } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/storage";

describe("Mastra storage", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => createMastraStorage({ env: {} })).toThrow(
      "DATABASE_URL is not configured for Mastra storage.",
    );
  });

  it("creates a Postgres-backed storage instance from DATABASE_URL", async () => {
    const storage = createMastraStorage({
      env: {
        DATABASE_URL: "postgres://user:pass@example.com:5432/app",
        MASTRA_POSTGRES_SCHEMA: "mastra_test",
      },
    });

    expect(storage.constructor.name).toBe("PostgresStore");
    await storage.close();
  });
});
