import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeAttachmentDependencies } from "../feishu-resume-attachment";
import { loadResumeAttachment } from "../feishu-resume-attachment";

const mocks = { getObjectBytes: vi.fn() };
const dependencies = mocks satisfies ResumeAttachmentDependencies;

const formats = [
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
] as const;

describe("loadResumeAttachment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(formats)(
    "preserves original %s bytes and filename with the correct MIME type",
    async (extension, mediaType) => {
      const bytes = new Uint8Array([37, 80, 68, 70, 45]);
      const fileName = `简历.${extension.toUpperCase()}`;
      mocks.getObjectBytes.mockResolvedValue({ bytes, contentType: "application/octet-stream" });
      const result = await loadResumeAttachment(
        { fileName, storageKey: "resumes/source" },
        dependencies,
      );
      expect(result).toEqual({ bytes, fileName, mediaType });
      expect(result?.bytes).toBe(bytes);
    },
  );

  it.each([
    ["image/png", "简历.png"],
    ["image/jpeg", "简历.jpg"],
    ["application/vnd.ms-powerpoint", "简历.ppt"],
  ])("uses %s to name attachments without filenames", async (mediaType, fileName) => {
    const bytes = new Uint8Array([1, 2, 3]);
    mocks.getObjectBytes.mockResolvedValue({ bytes, contentType: mediaType });
    await expect(
      loadResumeAttachment({ fileName: null, storageKey: "resumes/source" }, dependencies),
    ).resolves.toEqual({ bytes, fileName, mediaType });
  });

  it("does not label invalid PDF bytes as a PDF attachment", async () => {
    mocks.getObjectBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    });
    await expect(
      loadResumeAttachment({ fileName: "resume.pdf", storageKey: "resumes/source" }, dependencies),
    ).resolves.toBeNull();
  });

  it.each(["resume.html", "resume.zip"])(
    "keeps unsupported %s out of the native preview path",
    async (fileName) => {
      mocks.getObjectBytes.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) });
      await expect(
        loadResumeAttachment({ fileName, storageKey: "resumes/source" }, dependencies),
      ).resolves.toBeNull();
    },
  );

  it("does not fetch when the record has no stored resume", async () => {
    await expect(
      loadResumeAttachment({ fileName: null, storageKey: null }, dependencies),
    ).resolves.toBeNull();
    expect(mocks.getObjectBytes).not.toHaveBeenCalled();
  });
});
