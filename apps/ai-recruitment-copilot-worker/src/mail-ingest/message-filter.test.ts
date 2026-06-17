import { describe, expect, it } from "vitest";
import { isMatchingResumeMailSubject, selectSupportedResumeAttachments } from "./message-filter";

describe("mail ingest message filter", () => {
  it("matches Boss Zhipin subjects by the configured keyword", () => {
    expect(isMatchingResumeMailSubject("【BOSS直聘】王泽投递了 Android 工程师", "boss直聘")).toBe(
      true,
    );
    expect(isMatchingResumeMailSubject("候选人王泽投递了 Android 工程师", "boss直聘")).toBe(false);
  });

  it("keeps supported resume attachments and ignores inline or unsupported files", () => {
    const attachments = selectSupportedResumeAttachments([
      {
        content: Buffer.from("pdf"),
        contentDisposition: "attachment",
        contentType: "application/pdf",
        filename: "王泽.pdf",
      },
      {
        content: Buffer.from("docx"),
        contentDisposition: "attachment",
        contentType: "application/octet-stream",
        filename: "王泽.docx",
      },
      {
        content: Buffer.from("logo"),
        contentDisposition: "inline",
        contentType: "image/png",
        filename: "logo.png",
      },
      {
        content: Buffer.from("txt"),
        contentDisposition: "attachment",
        contentType: "text/plain",
        filename: "note.txt",
      },
    ]);

    expect(attachments.map((attachment) => attachment.filename)).toEqual(["王泽.pdf", "王泽.docx"]);
  });
});
