import type { getObjectBytes } from "@app/object-storage";
import {
  getResumeDocumentExtension,
  getResumeDocumentKind,
  resumeDocumentFormats,
} from "@app/shared/resume-documents";

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

export interface ResumeAttachmentDependencies {
  getObjectBytes: typeof getObjectBytes;
}

const defaultDependencies: ResumeAttachmentDependencies = {
  getObjectBytes: async (storageKey) => {
    const { getObjectBytes: loadObject } = await import("@app/object-storage");
    return loadObject(storageKey);
  },
};

export async function loadResumeAttachment(
  {
    fileName,
    storageKey,
  }: {
    fileName: string | null;
    storageKey: string | null;
  },
  dependencies: ResumeAttachmentDependencies = defaultDependencies,
): Promise<{ bytes: Uint8Array; fileName: string; mediaType: string } | null> {
  const resume = storageKey ? await dependencies.getObjectBytes(storageKey) : null;
  if (!resume) {
    return null;
  }

  const input = {
    fileName: fileName ?? undefined,
    mediaType: resume.contentType ?? undefined,
  };
  const kind = getResumeDocumentKind(input);
  if (!kind || kind === "html" || (kind === "pdf" && !isPdf(resume.bytes))) {
    return null;
  }

  const extension = getResumeDocumentExtension(input);
  let [mediaType] = resumeDocumentFormats[kind].mediaTypes;
  if (kind === "image") {
    mediaType = extension === "png" ? "image/png" : "image/jpeg";
  }
  return {
    bytes: resume.bytes,
    fileName: fileName || `简历.${extension}`,
    mediaType,
  };
}
