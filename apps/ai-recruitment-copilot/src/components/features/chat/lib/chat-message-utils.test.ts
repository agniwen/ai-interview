import { describe, expect, it } from "vitest";
import { getChatAttachmentIdFromUrl } from "./chat-message-utils";

describe("getChatAttachmentIdFromUrl", () => {
  it("extracts attachment ids from legacy and workspace-scoped chat attachment URLs", () => {
    expect(getChatAttachmentIdFromUrl("/api/chat/attachments/att-legacy")).toBe("att-legacy");
    expect(getChatAttachmentIdFromUrl("/api/w/starrail/chat/attachments/att-workspace")).toBe(
      "att-workspace",
    );
    expect(
      getChatAttachmentIdFromUrl(
        "http://localhost:3000/api/w/starrail/chat/attachments/att-full?download=1",
      ),
    ).toBe("att-full");
  });
});
