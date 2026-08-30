import type { getObjectBytes } from "@app/server/lib/server/s3";
import type { convertPptxToPdf } from "@app/server/server/routes/studio/utils/pptx-preview";
import { getResumeDocumentKind } from "@arc/shared/resume-documents";

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 5 &&
    bytes[0] === 37 &&
    bytes[1] === 80 &&
    bytes[2] === 68 &&
    bytes[3] === 70 &&
    bytes[4] === 45
  );
}

export interface ResumePdfAttachmentDependencies {
  convertPptxToPdf: typeof convertPptxToPdf;
  getObjectBytes: typeof getObjectBytes;
}

const defaultDependencies: ResumePdfAttachmentDependencies = {
  convertPptxToPdf: async (bytes) => {
    const { convertPptxToPdf: convert } =
      await import("@app/server/server/routes/studio/utils/pptx-preview");
    return convert(bytes);
  },
  getObjectBytes: async (storageKey) => {
    const { getObjectBytes: loadObject } = await import("@app/server/lib/server/s3");
    return loadObject(storageKey);
  },
};

export async function loadResumePdfAttachment(
  {
    fileName,
    storageKey,
  }: {
    fileName: string | null;
    storageKey: string | null;
  },
  dependencies: ResumePdfAttachmentDependencies = defaultDependencies,
): Promise<Uint8Array | null> {
  const resume = storageKey ? await dependencies.getObjectBytes(storageKey) : null;
  if (!resume) {
    return null;
  }

  const kind = getResumeDocumentKind({
    fileName: fileName ?? undefined,
    mediaType: resume.contentType ?? undefined,
  });
  if (kind === "pdf") {
    return isPdf(resume.bytes) ? resume.bytes : null;
  }
  if (kind !== "pptx") {
    return null;
  }

  try {
    const pdf = await dependencies.convertPptxToPdf(resume.bytes);
    return isPdf(pdf) ? pdf : null;
  } catch (error) {
    console.warn("[feishu-interview-notification] failed to convert resume PDF:", error);
    return null;
  }
}
