import { describe, expect, it } from "vitest";
import { toPersistedChatMessage } from "../endpoints/chat";

describe("toPersistedChatMessage", () => {
  it("drops undefined optional fields from interrupted AI SDK messages", () => {
    const message = {
      id: "message-1",
      metadata: undefined,
      parts: [{ state: undefined, text: "partial reply", type: "text" as const }],
      role: "assistant" as const,
    };

    expect(toPersistedChatMessage(message)).toEqual({
      id: "message-1",
      parts: [{ text: "partial reply", type: "text" }],
      role: "assistant",
    });
  });
});
