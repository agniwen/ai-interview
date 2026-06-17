export type ResumeDocumentKind =
  | "pdf"
  | "doc"
  | "docx"
  | "html"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx"
  | "image";

export const resumeDocumentFormats: Record<
  ResumeDocumentKind,
  { extensions: readonly string[]; label: string; mediaTypes: readonly string[] }
> = {
  doc: {
    extensions: ["doc"],
    label: "DOC",
    mediaTypes: ["application/msword"],
  },
  docx: {
    extensions: ["docx"],
    label: "DOCX",
    mediaTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  html: {
    extensions: ["html", "htm"],
    label: "HTML",
    mediaTypes: ["text/html"],
  },
  image: {
    extensions: ["jpg", "jpeg", "png"],
    label: "JPG/PNG",
    mediaTypes: ["image/jpeg", "image/png"],
  },
  pdf: {
    extensions: ["pdf"],
    label: "PDF",
    mediaTypes: ["application/pdf"],
  },
  ppt: {
    extensions: ["ppt"],
    label: "PPT",
    mediaTypes: ["application/vnd.ms-powerpoint"],
  },
  pptx: {
    extensions: ["pptx"],
    label: "PPTX",
    mediaTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  },
  xls: {
    extensions: ["xls"],
    label: "XLS",
    mediaTypes: ["application/vnd.ms-excel"],
  },
  xlsx: {
    extensions: ["xlsx"],
    label: "XLSX",
    mediaTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
};

export const supportedResumeDocumentExtensions = Object.values(resumeDocumentFormats).flatMap(
  (format) => format.extensions,
);

export const supportedResumeDocumentAccept = Object.values(resumeDocumentFormats)
  .flatMap((format) => [
    ...format.mediaTypes,
    ...format.extensions.map((extension) => `.${extension}`),
  ])
  .join(",");

export const supportedResumeDocumentLabel = "PDF、DOC、DOCX、HTML、PPT、PPTX、XLS、XLSX、JPG、PNG";

function getExtensionFromFileName(fileName: string | undefined): string | null {
  const normalized = fileName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

function getExtensionFromMediaType(mediaType: string | undefined): string | null {
  const normalized = mediaType?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "image/jpeg") {
    return "jpg";
  }
  if (normalized === "image/png") {
    return "png";
  }
  for (const config of Object.values(resumeDocumentFormats)) {
    if (config.mediaTypes.includes(normalized)) {
      return config.extensions[0] ?? null;
    }
  }
  return null;
}

export function getResumeDocumentKind(input: {
  fileName?: string;
  mediaType?: string;
}): ResumeDocumentKind | null {
  const extension = getExtensionFromFileName(input.fileName);
  if (extension) {
    for (const [kind, config] of Object.entries(resumeDocumentFormats)) {
      if (config.extensions.includes(extension)) {
        return kind as ResumeDocumentKind;
      }
    }
  }

  const mediaType = input.mediaType?.trim().toLowerCase();
  if (mediaType) {
    for (const [kind, config] of Object.entries(resumeDocumentFormats)) {
      if (config.mediaTypes.includes(mediaType)) {
        return kind as ResumeDocumentKind;
      }
    }
  }

  return null;
}

export function isSupportedResumeDocumentInput(input: {
  fileName?: string;
  mediaType?: string;
}): boolean {
  return getResumeDocumentKind(input) !== null;
}

export function getResumeDocumentExtension(input: {
  fileName?: string;
  mediaType?: string;
}): string {
  const extension = getExtensionFromFileName(input.fileName);
  const kind = getResumeDocumentKind(input);
  if (kind && extension && resumeDocumentFormats[kind].extensions.includes(extension)) {
    return extension;
  }

  const mediaTypeExtension = getExtensionFromMediaType(input.mediaType);
  if (mediaTypeExtension) {
    return mediaTypeExtension;
  }

  if (kind) {
    return resumeDocumentFormats[kind].extensions[0] ?? kind;
  }

  return extension ?? "bin";
}
