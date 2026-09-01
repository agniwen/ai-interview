import { describe, expect, it, vi } from "vitest";
import { ApiDatabaseUnitOfWork } from "./api-database-unit-of-work.js";

describe("ApiDatabaseUnitOfWork", () => {
  it("reuses one transaction for nested owner commands and propagates failures", async () => {
    const transaction = { marker: "transaction" };
    const database = {
      transaction: vi.fn((work: (value: typeof transaction) => Promise<never>) =>
        work(transaction),
      ),
    };
    // SAFETY: the unit under test only consumes the transaction method supplied by this focused fake.
    const unitOfWork = new ApiDatabaseUnitOfWork(database as never);
    const failure = new Error("jobs write failed");

    await expect(
      unitOfWork.run(async () => {
        expect(unitOfWork.current()).toBe(transaction);
        await unitOfWork.run(async () => {
          expect(unitOfWork.current()).toBe(transaction);
        });
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(database.transaction).toHaveBeenCalledOnce();
  });
});
