import { and, inArray, isNotNull, eq } from "drizzle-orm";
import { getObjectStream } from "@app/object-storage";
import { resumeCandidateAvatar } from "@app/db-schema/schema";
import { db } from "../../runtime/db";

// 头像按简历内容哈希保存；对外只暴露哈希前缀作为缓存版本号，用来区分同一记录换简历后的新头像。
// Avatars are content-addressed; callers only receive a hash prefix as a cache-busting version.
const AVATAR_VERSION_LENGTH = 16;

function toCandidateAvatarVersion(contentHash: string): string {
  return contentHash.slice(0, AVATAR_VERSION_LENGTH);
}

// Returns contentHash → avatar version for resumes that have a stored headshot.
export async function loadCandidateAvatarVersions(
  contentHashes: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const hashes = [...new Set(contentHashes.filter((hash): hash is string => Boolean(hash)))];
  if (hashes.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ contentHash: resumeCandidateAvatar.contentHash })
    .from(resumeCandidateAvatar)
    .where(
      and(
        inArray(resumeCandidateAvatar.contentHash, hashes),
        isNotNull(resumeCandidateAvatar.storageKey),
      ),
    );
  return new Map(rows.map((row) => [row.contentHash, toCandidateAvatarVersion(row.contentHash)]));
}

export async function loadCandidateAvatarStorageKey(
  contentHash: string | null | undefined,
): Promise<string | null> {
  if (!contentHash) {
    return null;
  }
  const [row] = await db
    .select({ storageKey: resumeCandidateAvatar.storageKey })
    .from(resumeCandidateAvatar)
    .where(eq(resumeCandidateAvatar.contentHash, contentHash))
    .limit(1);
  return row?.storageKey ?? null;
}

// Opens the stored headshot object for a resume content hash, or null when there is none.
export async function openCandidateAvatarObject(
  contentHash: string | null | undefined,
): ReturnType<typeof getObjectStream> {
  const storageKey = await loadCandidateAvatarStorageKey(contentHash);
  return storageKey ? getObjectStream(storageKey) : null;
}
