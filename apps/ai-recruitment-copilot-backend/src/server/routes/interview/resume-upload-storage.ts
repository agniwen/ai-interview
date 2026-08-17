import type { JsonValue } from "@arc/db-schema/json";
import type { ResumeAnalysisResult, ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import type {
  ChatAttachmentRow,
  CreateAttachmentInput,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import type { ParsedResumeProfileResult } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

export interface ResumeUploadStorageDependencies {
  buildAttachmentKeyByHash: (contentHash: string, extension: string) => Promise<string>;
  createAttachment: (input: CreateAttachmentInput) => Promise<void>;
  findAttachmentByContentHash: (hash: string) => Promise<ChatAttachmentRow | null>;
  generateResumeStructured: (text: string) => Promise<ResumeParserStructured>;
  getResumeDocumentExtension: (input: { fileName: string; mediaType?: string }) => string;
  isResumeParseCacheEnabled: () => boolean;
  isResumeParseCacheSourceCompatible: (source: string | null) => boolean;
  isResumeAnalysisError: (error: Error) => boolean;
  parseResumeFastToProfile: (file: File) => Promise<ParsedResumeProfileResult>;
  projectAttachmentToResumeProfile: (
    parsedStructured: JsonValue | ResumeParserStructured | undefined,
  ) => ResumeProfile | null;
  putObjectBytes: (input: {
    body: Uint8Array;
    contentType: string;
    storageKey: string;
  }) => Promise<void>;
  sha256HexOfBytes: (bytes: Uint8Array) => Promise<string>;
  updateStructuredByHash: (hash: string, structured: ResumeParserStructured) => Promise<void>;
}

export interface ResumeUploadStorageResult {
  cachedResumeProfile: ResumeProfile | null;
  contentHash: string;
  resumeText: string | null;
  storageKey: string;
}

type ExistingAttachment = NonNullable<ChatAttachmentRow>;

async function copyCachedAttachmentForRequester(
  dependencies: ResumeUploadStorageDependencies,
  {
    contentHash,
    existing,
    file,
    organizationId,
    userId,
  }: {
    contentHash: string;
    existing: ExistingAttachment;
    file: File;
    organizationId: string;
    userId: string;
  },
) {
  await dependencies.createAttachment({
    contentHash,
    filename: file.name.slice(0, 255) || existing.filename || "resume.pdf",
    id: crypto.randomUUID(),
    mediaType: file.type || existing.mediaType || "application/pdf",
    organizationId,
    parsedAt: existing.parsedAt,
    parsedError: existing.parsedError,
    parsedPageCount: existing.parsedPageCount,
    parsedStatus: existing.parsedStatus,
    parsedStructured: existing.parsedStructured,
    parsedText: existing.parsedText,
    parsedTextSource: existing.parsedTextSource,
    size: file.size,
    storageKey: existing.storageKey,
    userId,
  });
}

async function createObjectAttachment(
  dependencies: ResumeUploadStorageDependencies,
  file: File,
  userId: string,
  organizationId: string,
  storageKey: string,
  contentHash: string,
  existing: ExistingAttachment | null,
) {
  const input: CreateAttachmentInput = {
    contentHash,
    filename: file.name.slice(0, 255) || existing?.filename || "resume.pdf",
    id: crypto.randomUUID(),
    mediaType: file.type || existing?.mediaType || "application/octet-stream",
    organizationId,
    size: file.size,
    storageKey,
    userId,
  };
  if (existing) {
    input.parsedAt = existing.parsedAt;
    input.parsedError = existing.parsedError;
    input.parsedPageCount = existing.parsedPageCount;
    input.parsedStatus = existing.parsedStatus;
    input.parsedStructured = existing.parsedStructured;
    input.parsedText = existing.parsedText;
    input.parsedTextSource = existing.parsedTextSource;
  } else {
    input.parsedStatus = "pending";
  }
  await dependencies.createAttachment(input);
}

export function createResumeUploadStorage(dependencies: ResumeUploadStorageDependencies) {
  async function storeInterviewResume(
    _interviewRecordId: string,
    file: File,
    userId: string,
    organizationId: string,
  ): Promise<ResumeUploadStorageResult | null> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentHash = await dependencies.sha256HexOfBytes(bytes);
      const cachedAttachment = dependencies.isResumeParseCacheEnabled()
        ? await dependencies.findAttachmentByContentHash(contentHash)
        : null;
      const existing =
        cachedAttachment &&
        dependencies.isResumeParseCacheSourceCompatible(cachedAttachment.parsedTextSource)
          ? cachedAttachment
          : null;

      if (existing?.parsedStructured) {
        const cached = dependencies.projectAttachmentToResumeProfile(existing.parsedStructured);
        if (cached) {
          await copyCachedAttachmentForRequester(dependencies, {
            contentHash,
            existing,
            file,
            organizationId,
            userId,
          });
          return {
            cachedResumeProfile: cached,
            contentHash,
            resumeText: existing.parsedText ?? null,
            storageKey: existing.storageKey,
          };
        }
      }

      if (existing?.parsedText && existing.parsedText.trim().length > 0) {
        try {
          const structured = await dependencies.generateResumeStructured(existing.parsedText);
          await dependencies.updateStructuredByHash(contentHash, structured);
          await copyCachedAttachmentForRequester(dependencies, {
            contentHash,
            existing: { ...existing, parsedStructured: structured },
            file,
            organizationId,
            userId,
          });
          return {
            cachedResumeProfile: dependencies.projectAttachmentToResumeProfile(structured),
            contentHash,
            resumeText: existing.parsedText,
            storageKey: existing.storageKey,
          };
        } catch (error) {
          console.error("[studio-interview] structured-from-text failed:", error);
          await copyCachedAttachmentForRequester(dependencies, {
            contentHash,
            existing,
            file,
            organizationId,
            userId,
          });
          return {
            cachedResumeProfile: null,
            contentHash,
            resumeText: existing.parsedText,
            storageKey: existing.storageKey,
          };
        }
      }

      const storageKey = await dependencies.buildAttachmentKeyByHash(
        contentHash,
        dependencies.getResumeDocumentExtension({ fileName: file.name, mediaType: file.type }),
      );
      const [putOutcome, parseOutcome] = await Promise.allSettled([
        dependencies.putObjectBytes({
          body: bytes,
          contentType: file.type || "application/octet-stream",
          storageKey,
        }),
        dependencies.parseResumeFastToProfile(file),
      ]);

      if (putOutcome.status === "rejected") {
        console.error("[studio-interview] failed to upload resume to S3:", putOutcome.reason);
        return null;
      }
      if (parseOutcome.status === "rejected") {
        console.error(
          "[studio-interview] resume parse failed (S3 PUT succeeded):",
          parseOutcome.reason,
        );
        return { cachedResumeProfile: null, contentHash, resumeText: null, storageKey };
      }

      const parsed = parseOutcome.value;
      await dependencies.createAttachment({
        contentHash,
        filename: file.name.slice(0, 255) || "resume.pdf",
        id: crypto.randomUUID(),
        mediaType: file.type || "application/octet-stream",
        organizationId,
        parsedAt: new Date(),
        parsedPageCount: parsed.parsedPageCount,
        parsedStatus: "ready",
        parsedStructured: parsed.parsedStructured,
        parsedText: parsed.parsedText,
        parsedTextSource: parsed.parsedTextSource,
        size: file.size,
        storageKey,
        userId,
      });

      return {
        cachedResumeProfile: parsed.resumeProfile,
        contentHash,
        resumeText: parsed.parsedText,
        storageKey,
      };
    } catch (error) {
      if (error instanceof Error && dependencies.isResumeAnalysisError(error)) {
        throw error;
      }
      console.error("[studio-interview] failed to upload resume to S3:", error);
      return null;
    }
  }

  async function storeResumeObjectOnly(
    file: File,
    userId: string,
    organizationId: string,
  ): Promise<{ storageKey: string; contentHash: string } | null> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentHash = await dependencies.sha256HexOfBytes(bytes);
      const storageKey = await dependencies.buildAttachmentKeyByHash(
        contentHash,
        dependencies.getResumeDocumentExtension({ fileName: file.name, mediaType: file.type }),
      );
      const cachedAttachment = dependencies.isResumeParseCacheEnabled()
        ? await dependencies.findAttachmentByContentHash(contentHash)
        : null;
      const existing =
        cachedAttachment &&
        dependencies.isResumeParseCacheSourceCompatible(cachedAttachment.parsedTextSource)
          ? cachedAttachment
          : null;

      await dependencies.putObjectBytes({
        body: bytes,
        contentType: file.type || existing?.mediaType || "application/octet-stream",
        storageKey,
      });

      await createObjectAttachment(
        dependencies,
        file,
        userId,
        organizationId,
        storageKey,
        contentHash,
        existing,
      );
      return { contentHash, storageKey };
    } catch (error) {
      console.error("[studio-interview] failed to upload resume object to S3:", error);
      return null;
    }
  }

  return { storeInterviewResume, storeResumeObjectOnly };
}

export interface ResolveResumeUploadStorageInput {
  interviewRecordId?: string;
  organizationId: string;
  parsedResumePayload: ResumeAnalysisResult | null;
  resume: File | null;
  storeObjectOnly?: (
    file: File,
    userId: string,
    organizationId: string,
  ) => Promise<{ storageKey: string; contentHash: string } | null>;
  storeParsedResume?: (
    interviewRecordId: string,
    file: File,
    userId: string,
    organizationId: string,
  ) => Promise<ResumeUploadStorageResult | null>;
  userId: string | null | undefined;
}

export async function resolveResumeUploadStorage({
  interviewRecordId,
  organizationId,
  parsedResumePayload,
  resume,
  storeObjectOnly,
  storeParsedResume,
  userId,
}: ResolveResumeUploadStorageInput): Promise<ResumeUploadStorageResult | null> {
  if (!(resume && userId)) {
    return null;
  }
  if (parsedResumePayload) {
    const stored = await storeObjectOnly?.(resume, userId, organizationId);
    if (!stored) {
      return null;
    }
    return {
      cachedResumeProfile: null,
      contentHash: stored.contentHash,
      resumeText: parsedResumePayload.resumeText,
      storageKey: stored.storageKey,
    };
  }
  if (!(interviewRecordId && storeParsedResume)) {
    return null;
  }
  return storeParsedResume(interviewRecordId, resume, userId, organizationId);
}
