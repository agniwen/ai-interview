import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";

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
