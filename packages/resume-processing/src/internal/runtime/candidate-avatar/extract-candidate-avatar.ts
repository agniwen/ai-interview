// Best-effort candidate headshot extraction that runs alongside resume OCR.
// 与简历 OCR 并行的候选人头像提取：仅支持 PDF 首页与图片简历，失败或置信度不足都不影响解析。

import { setTimeout as delay } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import { buildCandidateAvatarKeyByHash, putObjectBytes } from "@app/object-storage";
import { resumeCandidateAvatar } from "@app/db-schema/schema";
import type { ResumeCandidateAvatarStatus } from "@app/db-schema/schema";
import { sha256HexOfBytes } from "@app/shared/file-hash";
import { getResumeDocumentKind } from "@app/shared/resume-documents";
import { db } from "../db";
import { withFirstPageImage } from "./first-page-image";
import type { FirstPageSourceMediaType } from "./first-page-image";
import { getJevApiKey, locateHeadshotWithJev } from "./jev-headshot";
import type { HeadshotLocation } from "./jev-headshot";

// 低于该置信度的头像判断一律视为未获取到。
// Below this confidence the headshot is treated as not found.
export const CANDIDATE_AVATAR_MIN_CONFIDENCE = 0.5;
const AVATAR_EXTRACTION_TIMEOUT_MS = 45_000;
const ERROR_MESSAGE_MAX_LENGTH = 500;

export interface CandidateAvatarInput {
  bytes: Uint8Array;
  fileName?: string;
  mediaType?: string;
}

export interface CandidateAvatarRecord {
  boxConfidence: number | null;
  contentHash: string;
  durationMs: number;
  errorMessage: string | null;
  model: string | null;
  photoProbability: number | null;
  status: ResumeCandidateAvatarStatus;
  storageKey: string | null;
}

export interface CandidateAvatarDependencies {
  getApiKey: () => string | null;
  hashBytes: typeof sha256HexOfBytes;
  locateHeadshot: (input: {
    apiKey: string;
    image: Uint8Array<ArrayBuffer>;
    mediaType: "image/png";
    signal: AbortSignal;
  }) => Promise<HeadshotLocation>;
  now: () => number;
  saveAvatarRecord: (record: CandidateAvatarRecord) => Promise<void>;
  storeAvatarImage: (contentHash: string, jpeg: Uint8Array) => Promise<string>;
  withFirstPageImage: typeof withFirstPageImage;
}

async function storeAvatarImage(contentHash: string, jpeg: Uint8Array): Promise<string> {
  const storageKey = await buildCandidateAvatarKeyByHash(contentHash);
  await putObjectBytes({ body: jpeg, contentType: "image/jpeg", storageKey });
  return storageKey;
}

// 失败记录只覆盖此前的失败，不会冲掉已完成的识别结果。
// A failure only overwrites an earlier failure, never a completed result.
async function saveAvatarRecord(record: CandidateAvatarRecord): Promise<void> {
  const { contentHash: _contentHash, ...fields } = record;
  await db
    .insert(resumeCandidateAvatar)
    .values(record)
    .onConflictDoUpdate({
      set: {
        ...fields,
        attempts: sql`${resumeCandidateAvatar.attempts} + 1`,
        updatedAt: new Date(),
      },
      setWhere: record.status === "failed" ? eq(resumeCandidateAvatar.status, "failed") : undefined,
      target: resumeCandidateAvatar.contentHash,
    });
}

export const defaultCandidateAvatarDependencies: CandidateAvatarDependencies = {
  getApiKey: getJevApiKey,
  hashBytes: sha256HexOfBytes,
  locateHeadshot: locateHeadshotWithJev,
  now: () => performance.now(),
  saveAvatarRecord,
  storeAvatarImage,
  withFirstPageImage,
};

export function isConfidentHeadshot(location: HeadshotLocation): boolean {
  return (
    location.photoProbability >= CANDIDATE_AVATAR_MIN_CONFIDENCE &&
    location.person.confidence >= CANDIDATE_AVATAR_MIN_CONFIDENCE
  );
}

// PDF 取首页，图片简历直接使用图片本身；其他格式不识别头像。
// PDFs use their first page and image resumes use the image itself; other formats are skipped.
function resolveFirstPageSource(
  input: CandidateAvatarInput,
): { bytes: Uint8Array; mediaType: FirstPageSourceMediaType } | null {
  const kind = getResumeDocumentKind(input);
  if (kind === "pdf") {
    return { bytes: input.bytes, mediaType: "application/pdf" };
  }
  if (kind === "image") {
    const isPng =
      input.mediaType?.toLowerCase() === "image/png" ||
      input.fileName?.toLowerCase().endsWith(".png");
    return { bytes: input.bytes, mediaType: isPng ? "image/png" : "image/jpeg" };
  }
  return null;
}

function describeError(error: Error): string {
  return `${error.name}: ${error.message}`.slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

async function locateAndStoreAvatar(
  source: { bytes: Uint8Array; mediaType: FirstPageSourceMediaType },
  contentHash: string,
  apiKey: string,
  signal: AbortSignal,
  dependencies: CandidateAvatarDependencies,
): Promise<Omit<CandidateAvatarRecord, "contentHash" | "durationMs">> {
  const result = await dependencies.withFirstPageImage(source, async (page) => {
    const location = await dependencies.locateHeadshot({
      apiKey,
      image: page.png,
      mediaType: "image/png",
      signal,
    });
    const avatar = isConfidentHeadshot(location) ? page.cropAvatarJpeg(location) : null;
    return { avatar, location };
  });
  if (!result) {
    return {
      boxConfidence: null,
      errorMessage: "First page could not be rendered within Jev image limits.",
      model: null,
      photoProbability: null,
      status: "not_detected",
      storageKey: null,
    };
  }
  signal.throwIfAborted();
  const storageKey = result.avatar
    ? await dependencies.storeAvatarImage(contentHash, result.avatar)
    : null;
  return {
    boxConfidence: result.location.person.confidence,
    errorMessage: null,
    model: result.location.model,
    photoProbability: result.location.photoProbability,
    status: storageKey ? "detected" : "not_detected",
    storageKey,
  };
}

// 每次识别（成功、无头像或失败）都落一条记录；超时后台继续时也会在结束时补记。从不抛错。
// Records every attempt — detected, not detected, or failed — even when it settles after the
// caller stopped waiting. Never throws.
async function runCandidateAvatarExtraction(
  input: CandidateAvatarInput,
  source: { bytes: Uint8Array; mediaType: FirstPageSourceMediaType },
  apiKey: string,
  signal: AbortSignal,
  dependencies: CandidateAvatarDependencies,
): Promise<string | null> {
  const startedAt = dependencies.now();
  let contentHash: string | null = null;
  let outcome: Omit<CandidateAvatarRecord, "contentHash" | "durationMs">;
  try {
    contentHash = await dependencies.hashBytes(input.bytes);
    outcome = await locateAndStoreAvatar(source, contentHash, apiKey, signal, dependencies);
  } catch (error) {
    outcome = {
      boxConfidence: null,
      errorMessage: describeError(error instanceof Error ? error : new Error(String(error))),
      model: null,
      photoProbability: null,
      status: "failed",
      storageKey: null,
    };
  }
  const durationMs = Math.round(dependencies.now() - startedAt);
  if (outcome.status === "failed") {
    console.warn("[resume-avatar] candidate avatar extraction failed", {
      contentHash,
      durationMs,
      error: outcome.errorMessage,
      fileName: input.fileName,
    });
  }
  if (!contentHash) {
    return null;
  }
  try {
    await dependencies.saveAvatarRecord({ ...outcome, contentHash, durationMs });
  } catch (error) {
    console.warn("[resume-avatar] failed to record avatar extraction result", {
      contentHash,
      error: describeError(error instanceof Error ? error : new Error(String(error))),
      status: outcome.status,
    });
    return null;
  }
  return outcome.storageKey;
}

async function waitForTimeout(ms: number, signal: AbortSignal): Promise<null> {
  try {
    await delay(ms, null, { signal });
  } catch {
    // Cancelled once extraction settles first.
  }
  return null;
}

/**
 * 识别并保存简历首页的候选人头像，返回头像对象 key；未配置、未识别到或任何失败都返回 null。
 * 该函数从不抛错，调用方可以安全地与 OCR 并行等待。
 *
 * Detects and stores the candidate headshot from a resume's first page. Never throws:
 * missing configuration, low confidence, or any failure resolves to null.
 */
export async function extractCandidateAvatar(
  input: CandidateAvatarInput,
  dependencies: CandidateAvatarDependencies = defaultCandidateAvatarDependencies,
): Promise<string | null> {
  const apiKey = dependencies.getApiKey();
  const source = apiKey ? resolveFirstPageSource(input) : null;
  if (!(apiKey && source)) {
    return null;
  }
  const signal = AbortSignal.timeout(AVATAR_EXTRACTION_TIMEOUT_MS);
  // 渲染与存储步骤不可中断；超时后直接放弃等待，避免拖住 OCR。
  // Rendering and storage cannot be aborted, so stop waiting once the budget is spent.
  const stopTimer = new AbortController();
  const timedOut = waitForTimeout(AVATAR_EXTRACTION_TIMEOUT_MS, stopTimer.signal);
  try {
    return await Promise.race([
      runCandidateAvatarExtraction(input, source, apiKey, signal, dependencies),
      timedOut,
    ]);
  } finally {
    stopTimer.abort();
  }
}
