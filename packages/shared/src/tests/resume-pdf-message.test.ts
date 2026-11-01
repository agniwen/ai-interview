import { describe, expect, it } from "vitest";
import type { ArcMessage } from "../ai-message";
import { collectUploadedResumePdfs } from "../resume-pdf";

describe("collectUploadedResumePdfs", () => {
  it("collects supported resume file parts from user Arc messages", () => {
    const messages: ArcMessage[] = [
      {
        id: "message-1",
        parts: [
          {
            filename: "resume.pdf",
            mediaType: "application/pdf",
            type: "file",
            url: "data:application/pdf;base64,abc",
          },
        ],
        role: "user",
      },
      {
        id: "message-2",
        parts: [{ text: "ignore assistant", type: "text" }],
        role: "assistant",
      },
    ];

    expect(collectUploadedResumePdfs(messages)).toEqual([
      {
        filename: "resume.pdf",
        id: "message-1-file-0",
        mediaType: "application/pdf",
        url: "data:application/pdf;base64,abc",
      },
    ]);
  });

  it("uses default filenames and deduplicates by filename and url", () => {
    const messages: ArcMessage[] = [
      {
        id: "message-1",
        parts: [
          {
            mediaType: "application/pdf",
            type: "file",
            url: "data:application/pdf;base64,abc",
          },
          {
            mediaType: "application/pdf",
            name: "resume-1",
            type: "file",
            url: "data:application/pdf;base64,abc",
          },
        ],
        role: "user",
      },
    ];

    expect(collectUploadedResumePdfs(messages)).toEqual([
      {
        filename: "resume-1",
        id: "message-1-file-0",
        mediaType: "application/pdf",
        url: "data:application/pdf;base64,abc",
      },
    ]);
  });
});
