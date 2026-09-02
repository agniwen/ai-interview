import { describe, expect, it } from "vitest";
import { settleAllOrThrow } from "./parallel";

describe("settleAllOrThrow", () => {
  it("waits for siblings and preserves the first observed failure", async () => {
    const events: string[] = [];
    const firstError = new Error("first");
    const { promise, resolve } = Promise.withResolvers<string>();
    const result = settleAllOrThrow([
      Promise.reject(firstError),
      promise.then((value) => {
        events.push(value);
        return value;
      }),
    ] as const);
    resolve("settled");

    await expect(result).rejects.toBe(firstError);
    expect(events).toEqual(["settled"]);
  });

  it("does not mistake an undefined rejection reason for success", async () => {
    // oxlint-disable-next-line prefer-promise-reject-errors -- Third-party promises may legally reject with undefined; this is the regression boundary.
    await expect(settleAllOrThrow([Promise.reject()] as const)).rejects.toBeUndefined();
  });
});
