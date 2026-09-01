import { getResumeDocumentKind } from "@arc/shared/resume-documents";
import { backendApiUrl } from "@/lib/client/backend-api";

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
  // 查重对照的简历文件统一走 /:id/review 只读接口（同工作区成员即可读），
  // 保证对照查看不受 resumeLibrary/resumePool 读权限与可见范围配置影响。
  // The comparison dialog reads resume files from the permission-free
  // /:id/review surface so dedup viewing ignores the permission config.
  const resource = input.sourceType === "resume_pool_item" ? "intake/resume-pool" : "resumes";
  const baseUrl = backendApiUrl(
    `/workspaces/${input.slug}/candidates/${resource}/${input.id}/review`,
  );
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
