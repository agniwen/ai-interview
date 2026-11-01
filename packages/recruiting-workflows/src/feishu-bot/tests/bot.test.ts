import { describe, expect, it, vi } from "vitest";
import { trySendFeishuDirectCard } from "../bot";

describe("trySendFeishuDirectCard", () => {
  it("returns an empty message id when the document recipient cannot receive bot messages", async () => {
    const send = vi.fn(() => Promise.reject(new Error("Bot has NO availability to this user.")));

    await expect(trySendFeishuDirectCard(send)).resolves.toEqual({ id: null });
  });

  it("returns the message id after a successful send", async () => {
    const send = vi.fn(() => Promise.resolve({ messageId: "om_123" }));

    await expect(trySendFeishuDirectCard(send)).resolves.toEqual({ id: "om_123" });
  });
});
