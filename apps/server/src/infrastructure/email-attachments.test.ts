import { describe, expect, it } from "vitest";
import { buildEmailAttachments } from "./email-attachments";

describe("buildEmailAttachments", () => {
  it("preserves file content, name, and media type for Resend", async () => {
    const [attachment] = await buildEmailAttachments([
      new File(["email-content"], "附件.pdf", { type: "application/pdf" }),
    ]);

    expect(attachment?.filename).toBe("附件.pdf");
    expect(attachment?.contentType).toBe("application/pdf");
    expect(attachment?.content.toString()).toBe("email-content");
  });
});
