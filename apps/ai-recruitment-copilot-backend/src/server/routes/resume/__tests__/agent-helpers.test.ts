import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { stripNonImageFileUIParts } from "../utils/agent-helpers";
import { RESUME_PARSED_PART_TYPE } from "../bake-parsed-resume";

describe("stripNonImageFileUIParts", () => {
  it("removes relative-url PDF file parts before AI SDK model-message conversion", () => {
    const messages = [
      {
        id: "m1",
        parts: [
          { text: "请分析这份简历", type: "text" },
          {
            filename: "resume.pdf",
            mediaType: "application/pdf",
            type: "file",
            url: "/api/w/new/chat/attachments/0ef3f091-217c-4889-98b9-809b4f09bef4",
          },
          {
            data: {
              attachmentId: "0ef3f091-217c-4889-98b9-809b4f09bef4",
              filename: "resume.pdf",
              parsedStructured: null,
              parsedText: "OCR 原文",
            },
            type: RESUME_PARSED_PART_TYPE,
          },
          {
            filename: "screenshot.png",
            mediaType: "image/png",
            type: "file",
            url: "data:image/png;base64,abc",
          },
        ],
        role: "user",
      },
    ] as UIMessage[];

    const [message] = stripNonImageFileUIParts(messages);

    expect(message?.parts).toEqual([
      { text: "请分析这份简历", type: "text" },
      {
        data: {
          attachmentId: "0ef3f091-217c-4889-98b9-809b4f09bef4",
          filename: "resume.pdf",
          parsedStructured: null,
          parsedText: "OCR 原文",
        },
        type: RESUME_PARSED_PART_TYPE,
      },
      {
        filename: "screenshot.png",
        mediaType: "image/png",
        type: "file",
        url: "data:image/png;base64,abc",
      },
    ]);
  });
});
