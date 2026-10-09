import { describe, expect, it } from "vitest";
import { retryFeishuSummaryDelivery } from "./retry-feishu-summary-delivery";

describe("historical Feishu report delivery retry", () => {
  it("sends to the original app and open ID and completes the same delivery", async () => {
    const sent: unknown[] = [];
    const completed: unknown[] = [];
    const delivery = {
      conversationId: "conversation-1",
      interviewRecordId: "record-1",
      notificationId: "legacy-delivery-1",
      providerId: "feishu",
      recipientOpenId: "legacy-open-id",
    };
    const retried = await retryFeishuSummaryDelivery(delivery, {
      claim: () => Promise.resolve(true),
      markFailed: () => Promise.reject(new Error("unexpected failure")),
      markSent: (id, messageId) => {
        completed.push({ id, messageId });
        return Promise.resolve();
      },
      send: (target) => {
        sent.push(target);
        return Promise.resolve({ providerMessageId: "message-1" });
      },
    });
    expect(retried).toBe(true);
    expect(sent).toEqual([delivery]);
    expect(completed).toEqual([{ id: "legacy-delivery-1", messageId: "message-1" }]);
  });

  it("does not resend a delivery claimed by another retry", async () => {
    expect(
      await retryFeishuSummaryDelivery(
        {
          conversationId: "conversation-1",
          interviewRecordId: "record-1",
          notificationId: "delivery-1",
          providerId: "feishu",
          recipientOpenId: "open-1",
        },
        {
          claim: () => Promise.resolve(false),
          markFailed: () => Promise.reject(new Error("must not fail")),
          markSent: () => Promise.reject(new Error("must not complete")),
          send: () => Promise.reject(new Error("must not send")),
        },
      ),
    ).toBe(false);
  });

  it("leaves a failed attempt retryable on the original row", async () => {
    const failures: unknown[] = [];
    await retryFeishuSummaryDelivery(
      {
        conversationId: "conversation-1",
        interviewRecordId: "record-1",
        notificationId: "delivery-1",
        providerId: "feishu",
        recipientOpenId: "open-1",
      },
      {
        claim: () => Promise.resolve(true),
        markFailed: (id, error) => {
          failures.push({ error: error.message, id });
          return Promise.resolve();
        },
        markSent: () => Promise.reject(new Error("must not complete")),
        send: () => Promise.reject(new Error("Feishu unavailable")),
      },
    );
    expect(failures).toEqual([{ error: "Feishu unavailable", id: "delivery-1" }]);
  });
});
