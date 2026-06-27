import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMailSearchCriteria,
  extractJobCodesFromSubject,
  isMatchingResumeMailSubject,
  shouldProcessMailByListenStart,
  selectSupportedResumeAttachments,
} from "./message-filter";

describe("mail ingest message filter", () => {
  it("matches Boss Zhipin subjects by the configured keyword", () => {
    expect(isMatchingResumeMailSubject("【BOSS直聘】王泽投递了 Android 工程师", "boss直聘")).toBe(
      true,
    );
    expect(isMatchingResumeMailSubject("候选人王泽投递了 Android 工程师", "boss直聘")).toBe(false);
  });

  it("extracts only seven-character job codes from accepted subjects", () => {
    expect(extractJobCodesFromSubject("【BOSS直聘】王泽投递 AUR00AZ 前端工程师")).toEqual([
      "AUR00AZ",
    ]);
    expect(extractJobCodesFromSubject("【BOSS直聘】王泽投递 aurzz99 前端工程师")).toEqual([
      "AURZZ99",
    ]);
    expect(extractJobCodesFromSubject("【BOSS直聘】王泽投递 hrd00az 前端工程师")).toEqual([
      "HRD00AZ",
    ]);
    expect(extractJobCodesFromSubject("【BOSS直聘】王泽投递 AUR26062215347 前端工程师")).toEqual(
      [],
    );
  });

  it("searches all mails when no listen start is configured", () => {
    expect(buildMailSearchCriteria(null)).toEqual({ all: true });
  });

  it("uses the configured listen start to narrow the IMAP search", () => {
    const listenStartAt = new Date("2026-06-18T10:00:00.000Z");

    expect(buildMailSearchCriteria(listenStartAt)).toEqual({ since: listenStartAt });
  });

  it("filters messages before the configured listen start", () => {
    const listenStartAt = new Date("2026-06-18T10:00:00.000Z");

    expect(
      shouldProcessMailByListenStart(new Date("2026-06-18T09:59:59.999Z"), listenStartAt),
    ).toBe(false);
    expect(
      shouldProcessMailByListenStart(new Date("2026-06-18T10:00:00.000Z"), listenStartAt),
    ).toBe(true);
    expect(
      shouldProcessMailByListenStart(new Date("2026-06-18T10:00:00.001Z"), listenStartAt),
    ).toBe(true);
  });

  it("keeps processing all messages when no listen start is configured", () => {
    expect(shouldProcessMailByListenStart(new Date("2020-01-01T00:00:00.000Z"), null)).toBe(true);
  });

  it("skips messages with no received time when listen start is configured", () => {
    expect(shouldProcessMailByListenStart(null, new Date("2026-06-18T10:00:00.000Z"))).toBe(false);
  });

  it("does not move or delete source mailbox messages after processing", () => {
    const processorSource = readFileSync(new URL("processor.ts", import.meta.url), "utf-8");

    expect(processorSource).not.toContain("messageMove");
    expect(processorSource).not.toContain("messageDelete");
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
