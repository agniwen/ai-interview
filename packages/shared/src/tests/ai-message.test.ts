import { describe, expect, it } from "vitest";
import { getArcFileName, getArcFileUrl, isArcFilePart } from "../ai-message";

describe("Arc message helpers", () => {
  it("recognizes file parts", () => {
    expect(isArcFilePart({ mediaType: "application/pdf", type: "file", url: "data:" })).toBe(true);
    expect(isArcFilePart({ text: "hello", type: "text" })).toBe(false);
  });

  it("reads both filename and name for migration compatibility", () => {
    expect(getArcFileName({ filename: "cv.pdf", mediaType: "application/pdf", type: "file" })).toBe(
      "cv.pdf",
    );
    expect(getArcFileName({ mediaType: "application/pdf", name: "cv.pdf", type: "file" })).toBe(
      "cv.pdf",
    );
  });

  it("uses url first and falls back to data for file payloads", () => {
    expect(
      getArcFileUrl({
        data: "data:application/pdf;base64,abc",
        mediaType: "application/pdf",
        type: "file",
        url: "https://example.com/cv.pdf",
      }),
    ).toBe("https://example.com/cv.pdf");
    expect(
      getArcFileUrl({
        data: "data:application/pdf;base64,abc",
        mediaType: "application/pdf",
        type: "file",
      }),
    ).toBe("data:application/pdf;base64,abc");
  });
});
