import { describe, expect, it, vi } from "vitest";
import { RuntimeCloseStack } from "../runtime-lifecycle";

describe("RuntimeCloseStack", () => {
  it("closes owned resources in reverse creation order", async () => {
    const calls: string[] = [];
    const stack = new RuntimeCloseStack();
    stack.add("database", () => calls.push("database"));
    stack.add("bot", () => calls.push("bot"));
    stack.add("server", () => calls.push("server"));

    await stack.close();

    expect(calls).toEqual(["server", "bot", "database"]);
  });

  it("shares one idempotent close operation", async () => {
    const close = vi.fn(() => Promise.resolve());
    const stack = new RuntimeCloseStack();
    stack.add("database", close);

    await Promise.all([stack.close(), stack.close()]);

    expect(close).toHaveBeenCalledOnce();
  });

  it("continues closing older resources after one close failure", async () => {
    const closeDatabase = vi.fn(() => Promise.resolve());
    const stack = new RuntimeCloseStack();
    stack.add("database", closeDatabase);
    stack.add("server", () => {
      throw new Error("server close failed");
    });

    await expect(stack.close()).rejects.toThrow(AggregateError);
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
