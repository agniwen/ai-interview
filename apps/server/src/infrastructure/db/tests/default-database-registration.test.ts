import { describe, expect, it, vi } from "vitest";
import type * as databaseContext from "@app/database/context";

const mocks = vi.hoisted(() => ({ setDefaultDatabase: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Observes the registration call without replacing the real ambient database implementation.
vi.mock("@app/database/context", async (importOriginal) => ({
  ...(await importOriginal<typeof databaseContext>()),
  setDefaultDatabase: mocks.setDefaultDatabase,
}));

describe("Server database registration", () => {
  it("registers the Server pool as the shared-package database when the pool module loads", async () => {
    const { db } = await import("../index");

    expect(mocks.setDefaultDatabase).toHaveBeenCalledWith(db);
  });
});
