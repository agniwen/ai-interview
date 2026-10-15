// Backfills the candidate headshot when a parse is served from cache and OCR is skipped.
// 解析命中缓存（跳过 OCR）时补做头像识别：同一份简历已有结果就不再调用 Jev，失败的记录会有限次重试。

import { eq } from "drizzle-orm";
import { resumeCandidateAvatar } from "@app/db-schema/schema";
import type { ResumeCandidateAvatarStatus } from "@app/db-schema/schema";
import { getResumeDocumentKind } from "@app/shared/resume-documents";
import { db } from "../db";
import { extractCandidateAvatar } from "./extract-candidate-avatar";
import { getJevApiKey } from "./jev-headshot";

export interface EnsureCandidateAvatarInput {
  // sha256 of the file bytes when the caller already knows it; avoids loading bytes when a
  // record exists.
  contentHash: string | null | undefined;
  fileName?: string;
  loadBytes: () => Promise<Uint8Array | null>;
  mediaType?: string;
}

// 失败的识别最多自动重试到这个总次数；之后需要人工处理。
// Failed extractions are retried automatically until this many attempts in total.
export const CANDIDATE_AVATAR_MAX_ATTEMPTS = 3;

export interface CandidateAvatarAttempt {
  attempts: number;
  status: ResumeCandidateAvatarStatus;
}

export interface EnsureCandidateAvatarDependencies {
  extractCandidateAvatar: typeof extractCandidateAvatar;
  getApiKey: () => string | null;
  loadAvatarAttempt: (contentHash: string) => Promise<CandidateAvatarAttempt | null>;
}

async function loadAvatarAttempt(contentHash: string): Promise<CandidateAvatarAttempt | null> {
  const [row] = await db
    .select({
      attempts: resumeCandidateAvatar.attempts,
      status: resumeCandidateAvatar.status,
    })
    .from(resumeCandidateAvatar)
    .where(eq(resumeCandidateAvatar.contentHash, contentHash))
    .limit(1);
  return row ?? null;
}

const defaultDependencies: EnsureCandidateAvatarDependencies = {
  extractCandidateAvatar,
  getApiKey: getJevApiKey,
  loadAvatarAttempt,
};

function shouldExtract(attempt: CandidateAvatarAttempt | null): boolean {
  return (
    !attempt || (attempt.status === "failed" && attempt.attempts < CANDIDATE_AVATAR_MAX_ATTEMPTS)
  );
}

function isAvatarSupportedDocument(input: { fileName?: string; mediaType?: string }): boolean {
  const kind = getResumeDocumentKind(input);
  return kind === "pdf" || kind === "image";
}

/**
 * 缓存命中路径调用：该简历还没有识别记录、或此前识别失败且未达重试上限时才补跑识别。从不抛错。
 * Called from cache-hit parse paths: runs extraction when this resume has no avatar record yet,
 * or its earlier attempts failed and the retry limit is not reached. Never throws.
 */
export async function ensureCandidateAvatar(
  input: EnsureCandidateAvatarInput,
  dependencies: EnsureCandidateAvatarDependencies = defaultDependencies,
): Promise<void> {
  if (!(dependencies.getApiKey() && isAvatarSupportedDocument(input))) {
    return;
  }
  try {
    if (
      input.contentHash &&
      !shouldExtract(await dependencies.loadAvatarAttempt(input.contentHash))
    ) {
      return;
    }
    const bytes = await input.loadBytes();
    if (!bytes) {
      return;
    }
    await dependencies.extractCandidateAvatar({
      bytes,
      fileName: input.fileName,
      mediaType: input.mediaType,
    });
  } catch (error) {
    console.warn("[resume-avatar] cached-parse avatar backfill skipped", {
      error: error instanceof Error ? error.message : String(error),
      fileName: input.fileName,
    });
  }
}

// Convenience for upload paths that already hold the file bytes and hash.
export function ensureCandidateAvatarForFile(
  file: File,
  bytes: Uint8Array,
  contentHash: string,
): Promise<void> {
  return ensureCandidateAvatar({
    contentHash,
    fileName: file.name,
    loadBytes: () => Promise.resolve(bytes),
    mediaType: file.type,
  });
}
