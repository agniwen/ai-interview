import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadResumePdfAttachment } from "../feishu-resume-attachment";

const mocks = vi.hoisted(() => ({
  convertPptxToPdf: vi.fn(),
  getObjectBytes: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  getObjectBytes: mocks.getObjectBytes,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview", () => ({
  convertPptxToPdf: mocks.convertPptxToPdf,
}));

describe("loadResumePdfAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stored PDF bytes unchanged", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    mocks.getObjectBytes.mockResolvedValue({ bytes, contentType: "application/pdf" });

    await expect(
      loadResumePdfAttachment({ fileName: "resume.pdf", storageKey: "resumes/resume.pdf" }),
    ).resolves.toBe(bytes);
    expect(mocks.convertPptxToPdf).not.toHaveBeenCalled();
  });

  it("converts PPTX resumes before embedding them as PDF", async () => {
    const source = new Uint8Array([1, 2, 3]);
    const pdf = new Uint8Array([37, 80, 68, 70, 45]);
    mocks.getObjectBytes.mockResolvedValue({
      bytes: source,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    mocks.convertPptxToPdf.mockResolvedValue(pdf);

    await expect(
      loadResumePdfAttachment({ fileName: "resume.pptx", storageKey: "resumes/resume.pptx" }),
    ).resolves.toBe(pdf);
    expect(mocks.convertPptxToPdf).toHaveBeenCalledWith(source);
  });

  it("does not relabel unsupported source bytes as PDF", async () => {
    mocks.getObjectBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(
      loadResumePdfAttachment({ fileName: "resume.docx", storageKey: "resumes/resume.docx" }),
    ).resolves.toBeNull();
    expect(mocks.convertPptxToPdf).not.toHaveBeenCalled();
  });
});
