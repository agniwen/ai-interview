// Best-effort candidate headshot extraction that runs alongside resume OCR.
// 与简历 OCR 并行的候选人头像提取：仅支持 PDF 首页与图片简历，失败或置信度不足都不影响解析。

import { setTimeout as delay } from "node:timers/promises";
import { buildCandidateAvatarKeyByHash, putObjectBytes } from "@app/object-storage";
import { resumeCandidateAvatar } from "@app/db-schema/schema";
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

export interface CandidateAvatarInput {
  bytes: Uint8Array;
  fileName?: string;
  mediaType?: string;
}

export interface CandidateAvatarRecord {
  boxConfidence: number;
  contentHash: string;
  model: string;
  photoProbability: number;
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
  saveAvatarRecord: (record: CandidateAvatarRecord) => Promise<void>;
  storeAvatarImage: (contentHash: string, jpeg: Uint8Array) => Promise<string>;
  withFirstPageImage: typeof withFirstPageImage;
}

async function storeAvatarImage(contentHash: string, jpeg: Uint8Array): Promise<string> {
  const storageKey = await buildCandidateAvatarKeyByHash(contentHash);
  await putObjectBytes({ body: jpeg, contentType: "image/jpeg", storageKey });
  return storageKey;
}

async function saveAvatarRecord(record: CandidateAvatarRecord): Promise<void> {
  await db
    .insert(resumeCandidateAvatar)
    .values(record)
    .onConflictDoUpdate({
      set: {
        boxConfidence: record.boxConfidence,
        model: record.model,
        photoProbability: record.photoProbability,
        storageKey: record.storageKey,
        updatedAt: new Date(),
      },
      target: resumeCandidateAvatar.contentHash,
    });
}

export const defaultCandidateAvatarDependencies: CandidateAvatarDependencies = {
  getApiKey: getJevApiKey,
  hashBytes: sha256HexOfBytes,
  locateHeadshot: locateHeadshotWithJev,
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

async function runCandidateAvatarExtraction(
  input: CandidateAvatarInput,
  apiKey: string,
  signal: AbortSignal,
  dependencies: CandidateAvatarDependencies,
): Promise<string | null> {
  const source = resolveFirstPageSource(input);
  if (!source) {
    return null;
  }
  const contentHash = await dependencies.hashBytes(input.bytes);
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
    return null;
  }
  signal.throwIfAborted();
  const storageKey = result.avatar
    ? await dependencies.storeAvatarImage(contentHash, result.avatar)
    : null;
  await dependencies.saveAvatarRecord({
    boxConfidence: result.location.person.confidence,
    contentHash,
    model: result.location.model,
    photoProbability: result.location.photoProbability,
    storageKey,
  });
  return storageKey;
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
  if (!apiKey) {
    return null;
  }
  const signal = AbortSignal.timeout(AVATAR_EXTRACTION_TIMEOUT_MS);
  // 渲染与存储步骤不可中断；超时后直接放弃等待，避免拖住 OCR。
  // Rendering and storage cannot be aborted, so stop waiting once the budget is spent.
  const stopTimer = new AbortController();
  const timedOut = waitForTimeout(AVATAR_EXTRACTION_TIMEOUT_MS, stopTimer.signal);
  try {
    return await Promise.race([
      runCandidateAvatarExtraction(input, apiKey, signal, dependencies),
      timedOut,
    ]);
  } catch (error) {
    console.warn("[resume-avatar] candidate avatar extraction skipped", {
      error: error instanceof Error ? error.message : String(error),
      fileName: input.fileName,
    });
    return null;
  } finally {
    stopTimer.abort();
  }
}
