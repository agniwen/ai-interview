export type ResumeDocumentKind = "pdf" | "docx" | "pptx" | "xlsx";

export const resumeDocumentFormats: Record<
  ResumeDocumentKind,
  { extensions: readonly string[]; label: string; mediaTypes: readonly string[] }
> = {
  docx: {
    extensions: ["docx"],
    label: "DOCX",
    mediaTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  pdf: {
    extensions: ["pdf"],
    label: "PDF",
    mediaTypes: ["application/pdf"],
  },
  pptx: {
    extensions: ["pptx"],
    label: "PPTX",
    mediaTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
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

export const supportedResumeDocumentLabel = "PDF、DOCX、PPTX、XLSX";

function getExtensionFromFileName(fileName: string | undefined): string | null {
  const normalized = fileName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

export function getResumeDocumentKind(input: {
  fileName?: string;
  mediaType?: string;
}): ResumeDocumentKind | null {
  const mediaType = input.mediaType?.trim().toLowerCase();
  if (mediaType) {
    for (const [kind, config] of Object.entries(resumeDocumentFormats)) {
      if (config.mediaTypes.includes(mediaType)) {
        return kind as ResumeDocumentKind;
      }
    }
  }

  const extension = getExtensionFromFileName(input.fileName);
  if (extension) {
    for (const [kind, config] of Object.entries(resumeDocumentFormats)) {
      if (config.extensions.includes(extension)) {
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
  return getResumeDocumentKind(input) ?? getExtensionFromFileName(input.fileName) ?? "bin";
}
