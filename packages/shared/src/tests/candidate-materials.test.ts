import { describe, expect, it } from "vitest";
import {
  CANDIDATE_MATERIAL_FILE_LABEL,
  CANDIDATE_MATERIAL_MAX_BYTES,
  CANDIDATE_MATERIAL_MAX_COUNT,
  candidateMaterialUrlSchema,
  createCandidateMaterialLinkSchema,
  deriveCandidateMaterialLinkTitle,
  getCandidateMaterialBadgeLabel,
  inferCandidateMaterialCategory,
  isPreviewableCandidateMaterial,
  isSupportedCandidateMaterialFile,
  updateCandidateMaterialSchema,
  validateCandidateMaterialFiles,
} from "../candidate-materials";

describe("candidate materials shared contracts", () => {
  it("validates http/https URLs and rejects unsafe or invalid links", () => {
    expect(candidateMaterialUrlSchema.safeParse("https://example.com/portfolio").success).toBe(
      true,
    );
    expect(candidateMaterialUrlSchema.safeParse("http://localhost:3000/demo").success).toBe(true);
    expect(candidateMaterialUrlSchema.safeParse("mailto:user@example.com").success).toBe(false);
    expect(candidateMaterialUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
    expect(candidateMaterialUrlSchema.safeParse("ftp://example.com/file.zip").success).toBe(false);
    expect(candidateMaterialUrlSchema.safeParse("not-a-url").success).toBe(false);
    expect(candidateMaterialUrlSchema.safeParse("   ").success).toBe(false);
    expect(
      candidateMaterialUrlSchema.safeParse(`https://example.com/${"a".repeat(2040)}`).success,
    ).toBe(false);
  });

  it("applies defaults and constraints on link creation and material update schemas", () => {
    const created = createCandidateMaterialLinkSchema.parse({
      url: "  https://github.com/candidate/works  ",
    });
    expect(created).toEqual({
      category: "portfolio",
      notes: "",
      title: undefined,
      url: "https://github.com/candidate/works",
    });

    expect(updateCandidateMaterialSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(updateCandidateMaterialSchema.parse({ notes: "补充说明", title: "作品演示" })).toEqual({
      notes: "补充说明",
      title: "作品演示",
    });
  });

  it("infers material category and badge labels from file extension, MIME type, and kind", () => {
    expect(inferCandidateMaterialCategory("preview.png")).toBe("image");
    expect(inferCandidateMaterialCategory("shot", "image/webp")).toBe("image");
    expect(inferCandidateMaterialCategory("demo.mp4")).toBe("video");
    expect(inferCandidateMaterialCategory("clip", "video/webm")).toBe("video");
    expect(inferCandidateMaterialCategory("portfolio.zip")).toBe("archive");
    expect(inferCandidateMaterialCategory("works.7z")).toBe("archive");
    expect(inferCandidateMaterialCategory("works.tar.gz")).toBe("archive");
    expect(inferCandidateMaterialCategory("case-study.pdf")).toBe("document");
    expect(inferCandidateMaterialCategory("raw-assets.bin")).toBe("other");

    expect(getCandidateMaterialBadgeLabel({ category: "portfolio", kind: "link" })).toBe("链接");
    expect(getCandidateMaterialBadgeLabel({ category: "image", kind: "file" })).toBe("图片");
    expect(getCandidateMaterialBadgeLabel({ category: "video", kind: "file" })).toBe("视频");
    expect(getCandidateMaterialBadgeLabel({ category: "archive", kind: "file" })).toBe("压缩包");
    expect(getCandidateMaterialBadgeLabel({ category: "document", kind: "file" })).toBe("PDF");
    expect(getCandidateMaterialBadgeLabel({ category: "other", kind: "file" })).toBe("附件");
  });

  it("allows only PDF, archives, common video formats, and common image formats", () => {
    expect(isSupportedCandidateMaterialFile({ name: "portfolio.pdf" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "works.zip" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "works.rar" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "works.7z" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "works.tar" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "works.tgz" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "demo.mp4" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "demo.mov" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "demo.webm" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "demo.mkv" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "demo.avi" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "demo.m4v" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "shot.jpg" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "shot.png" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "shot.webp" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "shot.gif" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "shot.bmp" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "shot.avif" })).toBe(true);
    expect(isSupportedCandidateMaterialFile({ name: "screenshot", type: "image/png" })).toBe(true);

    expect(isSupportedCandidateMaterialFile({ name: "resume.docx" })).toBe(false);
    expect(isSupportedCandidateMaterialFile({ name: "icon.svg", type: "image/svg+xml" })).toBe(
      false,
    );
    expect(isSupportedCandidateMaterialFile({ name: "app.exe" })).toBe(false);
    expect(isSupportedCandidateMaterialFile({ name: "payload.bin" })).toBe(false);
    expect(isSupportedCandidateMaterialFile({ name: "blob", type: "image/svg+xml" })).toBe(false);
  });

  it("derives readable fallback titles for URLs", () => {
    expect(deriveCandidateMaterialLinkTitle("https://behance.net/candidate/ui/")).toBe(
      "behance.net/candidate/ui",
    );
    expect(deriveCandidateMaterialLinkTitle("https://example.com/")).toBe("example.com");
  });

  it("validates file count, empty files, max bytes, and supported formats", () => {
    expect(validateCandidateMaterialFiles([], 0)).toBe("请选择文件");
    expect(validateCandidateMaterialFiles([{ name: "a.zip", size: 0 }], 0)).toBe("a.zip 为空文件");
    expect(
      validateCandidateMaterialFiles(
        [{ name: "huge.mp4", size: CANDIDATE_MATERIAL_MAX_BYTES + 1 }],
        0,
      ),
    ).toBe("huge.mp4 超过 100 MB");
    expect(
      validateCandidateMaterialFiles(
        [{ name: "extra.zip", size: 1024 }],
        CANDIDATE_MATERIAL_MAX_COUNT,
      ),
    ).toContain(String(CANDIDATE_MATERIAL_MAX_COUNT));
    expect(validateCandidateMaterialFiles([{ name: "notes.docx", size: 1024 }], 0)).toBe(
      `notes.docx 格式不支持，仅支持 ${CANDIDATE_MATERIAL_FILE_LABEL}`,
    );
    expect(validateCandidateMaterialFiles([{ name: "works.zip", size: 2048 }], 2)).toBeNull();
  });

  it("marks only image and video file items as previewable", () => {
    expect(isPreviewableCandidateMaterial({ contentType: "image/png", kind: "file" })).toBe(true);
    expect(isPreviewableCandidateMaterial({ contentType: "video/mp4", kind: "file" })).toBe(true);
    expect(isPreviewableCandidateMaterial({ contentType: "application/zip", kind: "file" })).toBe(
      false,
    );
    expect(isPreviewableCandidateMaterial({ contentType: null, kind: "link" })).toBe(false);
  });
});
