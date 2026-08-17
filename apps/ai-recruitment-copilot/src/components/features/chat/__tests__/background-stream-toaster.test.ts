import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { ChatFinishEvent } from "../lib/chat-registry";
import { shouldShowBackgroundStreamToast } from "../background-stream-toaster";

function finishEvent(overrides: Partial<ChatFinishEvent> = {}): ChatFinishEvent {
  return {
    chatId: "chat_1",
    isAbort: false,
    isDisconnect: false,
    isError: false,
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    message: {
      id: "message_1",
      parts: [{ text: "done", type: "text" }],
      role: "assistant",
    } as UIMessage,
    slug: "workspace",
    ...overrides,
  };
}

describe("shouldShowBackgroundStreamToast", () => {
  it("keeps normal assistant background replies visible", () => {
    expect(shouldShowBackgroundStreamToast(finishEvent(), "other_chat")).toBe(true);
  });

  it("does not toast for studio resume floating chats", () => {
    expect(
      shouldShowBackgroundStreamToast(
        finishEvent({ chatId: "studio-resume:resume_1:user:user_1" }),
        "other_chat",
      ),
    ).toBe(false);
  });

  it("does not toast for the current chat", () => {
    expect(shouldShowBackgroundStreamToast(finishEvent(), "chat_1")).toBe(false);
  });
});
