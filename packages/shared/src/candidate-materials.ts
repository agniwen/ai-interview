import { z } from "zod";
import { candidateMaterialCategoryValues } from "@app/db-schema/candidate-materials";
import type {
  CandidateMaterialCategory,
  CandidateMaterialKind,
  CandidateMaterialOwnerType,
} from "@app/db-schema/candidate-materials";

export {
  candidateMaterialCategoryLabels,
  candidateMaterialCategoryValues,
  candidateMaterialKindValues,
  candidateMaterialOwnerTypeValues,
} from "@app/db-schema/candidate-materials";
export type {
  CandidateMaterialCategory,
  CandidateMaterialKind,
  CandidateMaterialOwnerType,
} from "@app/db-schema/candidate-materials";

export const CANDIDATE_MATERIAL_MAX_BYTES = 100 * 1024 * 1024;
export const CANDIDATE_MATERIAL_MAX_COUNT = 30;

const PDF_EXTENSIONS = [".pdf"] as const;
const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz"] as const;
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"] as const;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"] as const;

const PDF_EXTENSION_SET = new Set<string>(PDF_EXTENSIONS);
const ARCHIVE_EXTENSION_SET = new Set<string>(ARCHIVE_EXTENSIONS);
const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS);
const IMAGE_EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);

const ARCHIVE_MIME_TYPES = new Set<string>([
  "application/gzip",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-gzip",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip-compressed",
  "application/zip",
]);

const VIDEO_MIME_TYPES = new Set<string>([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-matroska",
  "video/x-msvideo",
]);

const IMAGE_MIME_TYPES = new Set<string>([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const CANDIDATE_MATERIAL_FILE_ACCEPT = [
  ...PDF_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
].join(",");

export const CANDIDATE_MATERIAL_FILE_LABEL = "PDF、压缩包、常见视频、常见图片";

export const candidateMaterialUrlSchema = z
  .string()
  .trim()
  .min(1, "请输入资料链接")
  .max(2048, "链接长度不能超过 2048 个字符")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "请输入有效的 http 或 https 链接" },
  );

export const candidateMaterialCategorySchema = z.enum(candidateMaterialCategoryValues);

export const createCandidateMaterialLinkSchema = z.object({
  category: candidateMaterialCategorySchema.default("portfolio"),
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").default(""),
  title: z.string().trim().max(200, "标题不能超过 200 个字符").optional(),
  url: candidateMaterialUrlSchema,
});
export type CreateCandidateMaterialLinkInput = z.infer<typeof createCandidateMaterialLinkSchema>;

export const uploadCandidateMaterialMetadataSchema = z.object({
  category: candidateMaterialCategorySchema.optional(),
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").default(""),
  title: z.string().trim().max(200, "标题不能超过 200 个字符").optional(),
});
export type UploadCandidateMaterialMetadataInput = z.infer<
  typeof uploadCandidateMaterialMetadataSchema
>;

export const updateCandidateMaterialSchema = z.object({
  category: candidateMaterialCategorySchema.optional(),
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
  title: z.string().trim().min(1, "标题不能为空").max(200, "标题不能超过 200 个字符").optional(),
  url: candidateMaterialUrlSchema.optional(),
});
export type UpdateCandidateMaterialInput = z.infer<typeof updateCandidateMaterialSchema>;

export interface CandidateMaterialItem {
  category: CandidateMaterialCategory;
  contentType: string | null;
  createdAt: string;
  createdBy: string | null;
  fileName: string | null;
  id: string;
  kind: CandidateMaterialKind;
  notes: string;
  ownerType: CandidateMaterialOwnerType;
  sizeBytes: number | null;
  title: string;
  updatedAt: string;
  url: string | null;
}

function getExtension(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }
  return lower.slice(dotIndex);
}

function categoryFromExtension(extension: string): CandidateMaterialCategory | null {
  if (IMAGE_EXTENSION_SET.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSION_SET.has(extension)) {
    return "video";
  }
  if (ARCHIVE_EXTENSION_SET.has(extension)) {
    return "archive";
  }
  if (PDF_EXTENSION_SET.has(extension)) {
    return "document";
  }
  return null;
}

function categoryFromMimeType(contentType?: string): CandidateMaterialCategory | null {
  const normalizedType = contentType?.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (!normalizedType) {
    return null;
  }
  if (
    IMAGE_MIME_TYPES.has(normalizedType) ||
    (normalizedType.startsWith("image/") && normalizedType !== "image/svg+xml")
  ) {
    return "image";
  }
  if (VIDEO_MIME_TYPES.has(normalizedType) || normalizedType.startsWith("video/")) {
    return "video";
  }
  if (ARCHIVE_MIME_TYPES.has(normalizedType)) {
    return "archive";
  }
  if (normalizedType === "application/pdf") {
    return "document";
  }
  return null;
}

export function isSupportedCandidateMaterialFile(file: { name: string; type?: string }): boolean {
  const extension = getExtension(file.name);
  if (extension) {
    return categoryFromExtension(extension) !== null;
  }
  return categoryFromMimeType(file.type) !== null;
}

export function inferCandidateMaterialCategory(
  fileName: string,
  contentType?: string,
): CandidateMaterialCategory {
  const extension = getExtension(fileName);
  const byExtension = extension ? categoryFromExtension(extension) : null;
  if (byExtension) {
    return byExtension;
  }
  return categoryFromMimeType(contentType) ?? "other";
}

export function getCandidateMaterialBadgeLabel(
  item: Pick<CandidateMaterialItem, "category" | "kind">,
): string {
  if (item.kind === "link") {
    return "链接";
  }
  switch (item.category) {
    case "image": {
      return "图片";
    }
    case "video": {
      return "视频";
    }
    case "archive": {
      return "压缩包";
    }
    case "document": {
      return "PDF";
    }
    default: {
      return "附件";
    }
  }
}

export function deriveCandidateMaterialLinkTitle(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    const combined = `${parsed.hostname}${path}`;
    return combined.slice(0, 200) || url.trim().slice(0, 200);
  } catch {
    return url.trim().slice(0, 200);
  }
}

export function validateCandidateMaterialFiles(
  files: readonly { name: string; size: number; type?: string }[],
  existingCount: number,
): string | null {
  if (files.length === 0) {
    return "请选择文件";
  }
  if (existingCount + files.length > CANDIDATE_MATERIAL_MAX_COUNT) {
    return `每条记录最多上传 ${CANDIDATE_MATERIAL_MAX_COUNT} 份补充资料，请删除后再添加`;
  }
  for (const file of files) {
    if (!file.name.trim() || file.name.length > 255) {
      return "文件名不能为空且不能超过 255 个字符";
    }
    if (file.size <= 0) {
      return `${file.name} 为空文件`;
    }
    if (file.size > CANDIDATE_MATERIAL_MAX_BYTES) {
      return `${file.name} 超过 100 MB`;
    }
    if (!isSupportedCandidateMaterialFile(file)) {
      return `${file.name} 格式不支持，仅支持 ${CANDIDATE_MATERIAL_FILE_LABEL}`;
    }
  }
  return null;
}

export function isPreviewableCandidateMaterial(
  item: Pick<CandidateMaterialItem, "contentType" | "kind">,
): boolean {
  if (item.kind !== "file" || !item.contentType) {
    return false;
  }
  return item.contentType.startsWith("image/") || item.contentType.startsWith("video/");
}
