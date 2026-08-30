import { describe, expect, it } from "vitest";
import { convertChatMessageRow } from "./migrate-chat-messages-to-arc";

describe("convertChatMessageRow", () => {
  it("converts legacy UIMessage-shaped content to ArcMessage", () => {
    expect(
      convertChatMessageRow({
        content: {
          content: "hello",
          id: "message-1",
          role: "assistant",
        },
        id: "message-1",
      }),
    ).toEqual({
      id: "message-1",
      message: {
        id: "message-1",
        parts: [{ text: "hello", type: "text" }],
        role: "assistant",
      },
    });
  });

  it("returns an error for unsupported messages", () => {
    expect(
      convertChatMessageRow({
        content: { id: "message-1", role: "invalid" },
        id: "message-1",
      }),
    ).toEqual({
      error: "Unsupported ArcMessage role: invalid",
      id: "message-1",
    });
  });
});
