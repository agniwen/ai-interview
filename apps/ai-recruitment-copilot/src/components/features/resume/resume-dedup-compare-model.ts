import { getResumeDocumentKind } from "@arc/shared/resume-documents";

export type ResumeComparisonSourceType = "resume_pool_item" | "studio_interview";
export type ResumeComparisonDocumentKind = "docx" | "image" | "pdf" | "xlsx";

export function getResumeComparisonDocumentKind(
  fileName: string | null | undefined,
): ResumeComparisonDocumentKind | null {
  const documentKind = getResumeDocumentKind({
    fileName: fileName ?? undefined,
  });

  if (documentKind === "pptx") {
    return "pdf";
  }

  return documentKind === "pdf" ||
    documentKind === "docx" ||
    documentKind === "xlsx" ||
    documentKind === "image"
    ? documentKind
    : null;
}

export function getResumeComparisonDocument(input: {
  fileName: string | null;
  id: string;
  slug: string;
  sourceType: ResumeComparisonSourceType;
}): {
  downloadUrl: string;
  kind: ResumeComparisonDocumentKind;
  previewUrl: string;
} | null {
  const sourceDocumentKind = getResumeDocumentKind({
    fileName: input.fileName ?? undefined,
  });
  const documentKind = getResumeComparisonDocumentKind(input.fileName);
  const resource = input.sourceType === "resume_pool_item" ? "resume-pool" : "resumes";
  const baseUrl = `/api/w/${input.slug}/studio/${resource}/${input.id}`;
  const downloadUrl = `${baseUrl}/resume`;

  if (sourceDocumentKind === "pptx") {
    return {
      downloadUrl,
      kind: "pdf",
      previewUrl: `${baseUrl}/resume-preview.pdf`,
    };
  }

  if (documentKind) {
    return {
      downloadUrl,
      kind: documentKind,
      previewUrl: downloadUrl,
    };
  }

  return null;
}
