import { describe, expect, it, vi } from "vitest";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import { IdentityAdministrationService } from "./identity-administration.service.js";

function databaseReturning(rows: unknown[]) {
  const returning = vi.fn(async () => rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  // SAFETY: the service only exercises this explicitly modeled Drizzle update chain.
  const database = Object.assign(Object.create(null) as Database, { update });
  return { database, set };
}

describe("IdentityAdministrationService", () => {
  it("returns a stable domain error when the user does not exist", async () => {
    const { database } = databaseReturning([]);
    const service = new IdentityAdministrationService(database);

    await expect(service.updateUserRemark("missing-user", "note")).resolves.toEqual({
      error: { code: "USER_NOT_FOUND", userId: "missing-user" },
      ok: false,
    });
  });

  it("returns the updated value without exposing persistence dates", async () => {
    const updatedAt = new Date("2026-09-01T00:00:00.000Z");
    const { database, set } = databaseReturning([{ id: "user-1", remark: "note", updatedAt }]);
    const service = new IdentityAdministrationService(database);

    await expect(service.updateUserRemark("user-1", "  note  ")).resolves.toEqual({
      ok: true,
      value: { id: "user-1", remark: "note", updatedAt: updatedAt.toISOString() },
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ remark: "note" }));
  });
});
