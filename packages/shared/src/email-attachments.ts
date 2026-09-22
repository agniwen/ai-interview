export const EMAIL_ATTACHMENT_MAX_FILES = 5;
export const EMAIL_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const EMAIL_ATTACHMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
] as const;
const EMAIL_ATTACHMENT_EXTENSION_SET = new Set<string>(EMAIL_ATTACHMENT_EXTENSIONS);

export const EMAIL_ATTACHMENT_ACCEPT = EMAIL_ATTACHMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export const EMAIL_ATTACHMENT_FORMAT_LABEL = "PDF、DOC、DOCX、XLS、XLSX、PPT、PPTX、JPG、PNG";

function getFileExtension(name: string): string | null {
  const match = name
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

export function validateEmailAttachments(
  files: readonly { name: string; size: number }[],
): string | null {
  if (files.length > EMAIL_ATTACHMENT_MAX_FILES) {
    return `最多添加 ${EMAIL_ATTACHMENT_MAX_FILES} 个附件`;
  }

  let totalBytes = 0;
  for (const file of files) {
    const name = file.name.trim();
    if (!name || name.length > 255) {
      return "附件文件名不能为空且不能超过 255 个字符";
    }
    if (file.size <= 0) {
      return `「${name}」是空文件`;
    }
    if (file.size > EMAIL_ATTACHMENT_MAX_FILE_BYTES) {
      return `「${name}」超过 10 MB`;
    }
    const extension = getFileExtension(name);
    if (!extension || !EMAIL_ATTACHMENT_EXTENSION_SET.has(extension)) {
      return `「${name}」的格式不受支持`;
    }
    totalBytes += file.size;
  }

  if (totalBytes > EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
    return "附件总大小不能超过 20 MB";
  }
  return null;
}
