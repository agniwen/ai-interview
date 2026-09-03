import { zValidator } from "@hono/zod-validator";
import type { presignRecordingGetObjectUrl } from "@app/object-storage";
import { z } from "zod";
import { bodyLimit } from "hono/body-limit";
import type { findTranscriptAudioAsset } from "./transcript-audio-dao";
import { factory, jsonValidatorError } from "../../../../factory";
import type { createHumanMeetingTranscriptRevision } from "../../../meetings/transcription/revision-dao";
import type { loadHumanInterviewReview } from "../../../studio/routes/interviews/dao/human-interview-evaluation";
import type { resolveHumanInterviewMeetingInterviewerInviteToken } from "../../../studio/routes/interviews/dao/human-interview-meetings";
import { resolveHumanInterviewReviewMutationAccess } from "./access";
import { buildAttributionCorrection } from "./transcript-attribution";
import type { HumanInterviewReviewScopeResolver } from "../../../studio/routes/interviews/review-actions-route";

const confirmationSchema = z
  .object({
    assignments: z
      .array(
        z
          .object({ role: z.enum(["candidate", "interviewer", "unknown"]), turnId: z.uuid() })
          .strict(),
      )
      .min(1)
      .max(200),
    sourceRevisionId: z.uuid(),
  })
  .strict();

export function createHumanInterviewTranscriptAttributionRouter(
  dependencies: {
    create: typeof createHumanMeetingTranscriptRevision;
    load: typeof loadHumanInterviewReview;
    resolve: typeof resolveHumanInterviewMeetingInterviewerInviteToken;
    asset: typeof findTranscriptAudioAsset;
    sign: typeof presignRecordingGetObjectUrl;
  },
  resolveScope?: HumanInterviewReviewScopeResolver,
) {
  return factory
    .createApp()
    .post(
      "/:inviteToken/transcript-attribution",
      bodyLimit({
        maxSize: 64 * 1024,
        onError: (c) => c.json({ error: "确认内容过多，请分批操作。" }, 413),
      }),
      zValidator("json", confirmationSchema, jsonValidatorError("身份确认内容无效。")),
      async (c) => {
        const scope = await (resolveScope
          ? resolveScope(c)
          : dependencies.resolve(c.req.param("inviteToken")));
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const access = resolveHumanInterviewReviewMutationAccess(scope, "submit");
        if (access) {
          return c.json({ error: access.message }, access.status);
        }
        const review = await dependencies.load(scope);
        const input = c.req.valid("json");
        if (!review?.meetingSessionId || review.transcript?.id !== input.sourceRevisionId) {
          return c.json({ error: "转录版本已变化，请刷新后重试。" }, 409);
        }
        const correction = buildAttributionCorrection(review.transcript.turns, input.assignments);
        if (!correction) {
          return c.json({ error: "确认片段不属于当前转录或存在重复。" }, 400);
        }
        const result = await dependencies.create({
          actorId: scope.userId,
          confirmedRoles: correction.confirmedRoles,
          correction: {
            language: review.transcript.language,
            sourceRevisionId: input.sourceRevisionId,
            turns: correction.turns,
          },
          meetingId: review.meetingSessionId,
          organizationId: scope.organizationId,
        });
        if (result === "conflict" || result === "invalid-range" || result === "not-found") {
          return c.json({ error: "转录已变化或时间范围无效，请刷新后重试。" }, 409);
        }
        // Confirmation versions the transcript only; it never overwrites an evaluation or sends a notification.
        return c.json({ revisionId: result.id }, 201);
      },
    )
    .get("/:inviteToken/transcript-audio/:turnId", async (c) => {
      const scope = await (resolveScope
        ? resolveScope(c)
        : dependencies.resolve(c.req.param("inviteToken")));
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      const review = await dependencies.load(scope);
      const turn = review?.transcript?.turns.find((item) => item.id === c.req.param("turnId"));
      if (!review?.meetingSessionId || !turn?.attribution) {
        return c.json({ error: "此片段没有可回听的录音来源。" }, 404);
      }
      const { sourceId } = turn.attribution;
      const asset = await dependencies.asset(review.meetingSessionId, sourceId);
      if (!asset) {
        return c.json({ error: "录音来源不可用。" }, 404);
      }
      const offset = asset.recordingIdentity?.offsetMs ?? 0;
      return c.json(
        {
          endSeconds: Math.min(asset.durationMs, turn.endMs - offset) / 1000,
          startSeconds: Math.max(0, turn.startMs - offset) / 1000,
          url: await dependencies.sign(asset.storageKey, 300),
        },
        200,
      );
    });
}
