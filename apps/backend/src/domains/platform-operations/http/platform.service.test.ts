import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { IdentityAdministrationCommands } from "../../identity-access/public.js";
import type { IdentityOperationalReadModel } from "../infrastructure/operational-read-model.port.js";
import type { PlatformOperationsPort } from "./platform.port.js";
import { PlatformService } from "./platform.service.js";

function serviceWith(identityAdministration: IdentityAdministrationCommands) {
  // SAFETY: updateUserRemark does not access the read-model collaborator in this focused adapter test.
  const readModel = {} as IdentityOperationalReadModel;
  // SAFETY: updateUserRemark does not access the operations collaborator in this focused adapter test.
  const operations = {} as PlatformOperationsPort;
  return new PlatformService(readModel, operations, identityAdministration);
}

describe("PlatformService identity administration adapter", () => {
  it("translates a domain not-found result into the established Nest error envelope", async () => {
    const service = serviceWith({
      updateUserRemark: vi.fn(async (userId: string) => ({
        error: { code: "USER_NOT_FOUND" as const, userId },
        ok: false as const,
      })),
    });

    const operation = service.updateUserRemark("missing-user", { remark: "note" });
    await expect(operation).rejects.toBeInstanceOf(NotFoundException);
    await expect(operation).rejects.toMatchObject({
      errorCode: "PLATFORM_USER_NOT_FOUND",
      response: { message: "User not found" },
    });
  });

  it("unwraps a successful domain result for the HTTP response", async () => {
    const value = {
      id: "user-1",
      remark: "note",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const service = serviceWith({
      updateUserRemark: vi.fn(async () => ({ ok: true as const, value })),
    });

    await expect(service.updateUserRemark("user-1", { remark: "note" })).resolves.toEqual(value);
  });
});
