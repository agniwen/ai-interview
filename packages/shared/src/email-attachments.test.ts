import { describe, expect, it } from "vitest";
import { EMAIL_ATTACHMENT_MAX_FILE_BYTES, validateEmailAttachments } from "./email-attachments";

describe("validateEmailAttachments", () => {
  it("accepts common email attachment formats within the size limits", () => {
    expect(
      validateEmailAttachments([
        { name: "录用通知.pdf", size: 1024 },
        { name: "薪酬说明.docx", size: 2048 },
      ]),
    ).toBeNull();
  });

  it("rejects unsupported, empty, oversized, too many, and over-total attachments", () => {
    expect(validateEmailAttachments([{ name: "script.html", size: 1 }])).toContain("格式不受支持");
    expect(validateEmailAttachments([{ name: "empty.pdf", size: 0 }])).toContain("空文件");
    expect(
      validateEmailAttachments([{ name: "large.pdf", size: EMAIL_ATTACHMENT_MAX_FILE_BYTES + 1 }]),
    ).toContain("超过 10 MB");
    expect(
      validateEmailAttachments(
        Array.from({ length: 6 }, (_, index) => ({ name: `${index}.pdf`, size: 1 })),
      ),
    ).toContain("最多添加 5 个附件");
    expect(
      validateEmailAttachments([
        { name: "a.pdf", size: EMAIL_ATTACHMENT_MAX_FILE_BYTES },
        { name: "b.pdf", size: EMAIL_ATTACHMENT_MAX_FILE_BYTES },
        { name: "c.pdf", size: 1 },
      ]),
    ).toContain("总大小不能超过 20 MB");
  });
});
