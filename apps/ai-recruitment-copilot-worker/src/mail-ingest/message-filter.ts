import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";

const JOB_CODE_IN_SUBJECT_PATTERN = /(^|[^A-Za-z0-9])(?<code>[A-Za-z0-9]{7})(?=$|[^A-Za-z0-9])/g;

export interface MailAttachmentLike {
  content: Buffer;
  contentDisposition?: string | false;
  contentType?: string;
  filename?: string;
}

export interface SupportedResumeMailAttachment {
  content: Buffer;
  contentType: string;
  filename: string;
}

export function buildMailSearchCriteria(listenStartAt?: Date | null) {
  if (!listenStartAt) {
    return { all: true };
  }
  return { since: listenStartAt };
}

export function shouldProcessMailByListenStart(
  receivedAt: Date | null,
  listenStartAt?: Date | null,
): boolean {
  if (!listenStartAt) {
    return true;
  }
  if (!receivedAt) {
    return false;
  }
  return receivedAt.getTime() >= listenStartAt.getTime();
}

export function isMatchingResumeMailSubject(subject: string | undefined, keyword: string): boolean {
  const normalizedSubject = subject?.trim().toLowerCase();
  const normalizedKeyword = keyword.trim().toLowerCase();
  return Boolean(
    normalizedSubject && normalizedKeyword && normalizedSubject.includes(normalizedKeyword),
  );
}

export function extractJobCodesFromSubject(subject: string | null | undefined): string[] {
  if (!subject) {
    return [];
  }
  const codes = new Set<string>();
  for (const match of subject.toUpperCase().matchAll(JOB_CODE_IN_SUBJECT_PATTERN)) {
    const code = match.groups?.code;
    if (code) {
      codes.add(code.toUpperCase());
    }
  }
  return [...codes];
}

export function selectSupportedResumeAttachments(
  attachments: readonly MailAttachmentLike[],
): SupportedResumeMailAttachment[] {
  return attachments
    .filter((attachment) => attachment.contentDisposition !== "inline")
    .filter((attachment) =>
      isSupportedResumeDocumentInput({
        fileName: attachment.filename,
        mediaType: attachment.contentType,
      }),
    )
    .map((attachment) => ({
      content: attachment.content,
      contentType: attachment.contentType || "application/octet-stream",
      filename: attachment.filename?.trim() || "resume",
    }));
}
