import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import {
  loadCandidateAvatarVersions,
  openCandidateAvatarObject,
} from "@app/resume-processing/review/support/candidate-avatars-dao";
import { humanInterviewRound } from "@app/db-schema/schema";
import { eq } from "drizzle-orm";
import { db } from "../../../../infrastructure/db/index";

export async function loadRoundResumeContentHash(roundId: string): Promise<string | null> {
  const [row] = await db
    .select({ contentHash: recruitingRecordReadModel.resumeContentHash })
    .from(humanInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
    )
    .where(eq(humanInterviewRound.id, roundId))
    .limit(1);
  return row?.contentHash ?? null;
}

/**
 * 简历头像版本，只用来判断有无头像和缓存失效，不是可直接访问的链接；取图仍需查看者自己的
 * 邀请链接鉴权。/ The headshot version only says whether one exists and busts caches; fetching it
 * still requires the viewer's own invite link.
 */
export async function loadCandidateAvatarVersion(
  contentHash: string | null,
): Promise<string | null> {
  const versions = await loadCandidateAvatarVersions([contentHash]);
  return versions.get(contentHash ?? "") ?? null;
}

/** 将头像对象转换为图片响应；没有头像时返回 null。/ Streams the headshot, or null without one. */
export async function createCandidateAvatarResponse(
  contentHash: string | null,
): Promise<Response | null> {
  const object = await openCandidateAvatarObject(contentHash);
  if (!object) {
    return null;
  }
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Type": object.contentType ?? "image/jpeg",
      ...(object.contentLength !== undefined && {
        "Content-Length": String(object.contentLength),
      }),
    },
  });
}
