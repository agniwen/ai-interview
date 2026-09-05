import { zValidator } from "@hono/zod-validator";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  humanInterviewEvaluationSchema,
  humanInterviewFinalOutcomeSchema,
} from "@app/db-schema/studio-interviews";
import {
  createMeetingTranscriptCorrectionSchema,
  MAX_MEETING_TRANSCRIPT_TEXT_CHARS,
  meetingLiveTranscriptDraftSchema,
} from "@app/shared/meeting-transcription";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  createHumanMeetingTranscriptRevision,
  createInitialHumanMeetingTranscriptRevision,
} from "../../../meetings/transcription/revision-dao";
import {
  loadHumanInterviewReview,
  recoverHumanInterviewReviewFromLiveTranscript,
  saveHumanInterviewEvaluationDraft,
} from "./dao/human-interview-evaluation";
import {
  loadHumanInterviewLiveTranscriptDraft,
  saveHumanInterviewLiveTranscriptDraft,
} from "./dao/human-interview-live-transcript";
import { resolveHumanInterviewMeetingInterviewerInviteToken } from "./dao/human-interview-meetings";
import {
  requestAutomaticHumanInterviewEvaluation,
  requestHumanInterviewEvaluationAfterTranscriptCorrection,
  requestManualHumanInterviewEvaluation,
  retryHumanInterviewTranscription,
} from "./utils/human-interview-evaluation-service";
import { submitAndFinalizeHumanInterviewEvaluation } from "./utils/human-interview-evaluation-submission";
import type { Env } from "../../../../type";
import { resolveHumanInterviewReviewMutationAccess } from "../../../public/routes/human-interview-review/access";
import { createHumanInterviewDocumentSyncRouter } from "../../../public/routes/human-interview-review/document-sync-route";
import { createHumanInterviewTranscriptAttributionRouter } from "../../../public/routes/human-interview-review/transcript-attribution-route";
import { findTranscriptAudioAsset } from "../../../public/routes/human-interview-review/transcript-audio-dao";
import { presignRecordingGetObjectUrl } from "@app/object-storage";
import { db } from "../../../../../lib/server/db/index";
import { createHumanInterviewDocumentSyncDao } from "./dao/human-interview-document-sync";

const documentSyncDao = createHumanInterviewDocumentSyncDao(db);

const liveTranscriptDraftSaveSchema = z.object({
  draft: meetingLiveTranscriptDraftSchema,
  expectedVersion: z.number().int().nonnegative(),
});

const humanInterviewEvaluationDraftSaveSchema = z
  .object({
    evaluation: humanInterviewEvaluationSchema,
    transcriptRevisionId: z.uuid().nullable(),
  })
  .strict();

export type HumanInterviewReviewScopeResolver = (
  context: Context<Env>,
) => ReturnType<typeof resolveHumanInterviewMeetingInterviewerInviteToken>;

// These endpoints use plain fetch in the public meeting board. Erasing their
// route schema here prevents the already-large global Hono RPC type from
// exceeding TypeScript's instantiation depth while preserving runtime routing.
export function createHumanInterviewReviewActionsRouter(
  resolveScope: HumanInterviewReviewScopeResolver,
): Hono<Env> {
  return factory
    .createApp()
    .get("/:inviteToken/live-transcript-draft", async (c) => {
      const scope = await resolveScope(c);
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (scope.role === "observer") {
        return c.json({ error: "旁听人员不能使用实时字幕。" }, 403);
      }
      const persisted = await loadHumanInterviewLiveTranscriptDraft({
        meetingId: scope.meetingId,
        userId: scope.userId,
      });
      return c.json(persisted, 200);
    })
    .put(
      "/:inviteToken/live-transcript-draft",
      bodyLimit({
        maxSize: 2 * 1024 * 1024,
        onError: (c) => c.json({ error: "实时字幕草稿过大。" }, 413),
      }),
      zValidator("json", liveTranscriptDraftSaveSchema, jsonValidatorError("实时字幕草稿无效。")),
      async (c) => {
        const scope = await resolveScope(c);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        if (scope.role === "observer") {
          return c.json({ error: "旁听人员不能使用实时字幕。" }, 403);
        }
        if (scope.status === "cancelled" || scope.status === "ended") {
          return c.json({ error: "真人复面已结束，不能继续保存实时字幕。" }, 409);
        }
        const input = c.req.valid("json");
        const saved = await saveHumanInterviewLiveTranscriptDraft({
          draft: input.draft,
          expectedVersion: input.expectedVersion,
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          userId: scope.userId,
        });
        return saved
          ? c.json(saved, 200)
          : c.json({ error: "实时字幕草稿已在其他窗口更新，请刷新后继续。" }, 409);
      },
    )
    .get("/:inviteToken/review", async (c) => {
      const scope = await resolveScope(c);
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      const review = await loadHumanInterviewReview({
        meetingId: scope.meetingId,
        organizationId: scope.organizationId,
        roundId: scope.roundId,
      });
      if (!review) {
        return c.json({ error: "真人复面复核内容不存在。" }, 404);
      }
      const documentSync = await documentSyncDao.loadStatus({
        organizationId: scope.organizationId,
        roundId: scope.roundId,
      });
      return c.json({ ...review, documentSync }, 200);
    })
    .route(
      "/",
      createHumanInterviewDocumentSyncRouter(
        {
          resolveInterviewer: resolveHumanInterviewMeetingInterviewerInviteToken,
          retry: (input) => documentSyncDao.retry(input),
        },
        resolveScope,
      ),
    )
    .route(
      "/",
      createHumanInterviewTranscriptAttributionRouter(
        {
          asset: findTranscriptAudioAsset,
          create: createHumanMeetingTranscriptRevision,
          load: loadHumanInterviewReview,
          resolve: resolveHumanInterviewMeetingInterviewerInviteToken,
          sign: presignRecordingGetObjectUrl,
        },
        resolveScope,
      ),
    )
    .post("/:inviteToken/live-transcript-recovery", async (c) => {
      const scope = await resolveScope(c);
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      const access = resolveHumanInterviewReviewMutationAccess(scope, "submit");
      if (access) {
        return c.json({ error: access.message }, access.status);
      }
      const recovered = await recoverHumanInterviewReviewFromLiveTranscript({
        actorId: scope.userId,
        meetingId: scope.meetingId,
        organizationId: scope.organizationId,
        roundId: scope.roundId,
      });
      if (recovered.status === "no-live-transcript") {
        return c.json({ error: "没有可用于恢复评价的实时字幕，请人工补录完整对话。" }, 409);
      }
      if (recovered.status === "meeting-not-ended") {
        return c.json({ error: "请先结束真人复面，再使用实时字幕生成评价。" }, 409);
      }
      if (recovered.status === "not-found") {
        return c.json({ error: "真人复面不存在。" }, 404);
      }
      await requestAutomaticHumanInterviewEvaluation({
        meetingSessionId: recovered.meetingSessionId,
        organizationId: scope.organizationId,
      });
      return c.json({ state: "generating" }, 202);
    })
    .post(
      "/:inviteToken/transcript",
      bodyLimit({
        maxSize: 8 * 1024 * 1024,
        onError: (c) => c.json({ error: "会议转录修订请求过大。" }, 413),
      }),
      zValidator(
        "json",
        createMeetingTranscriptCorrectionSchema,
        jsonValidatorError("会议转录修订无效。"),
      ),
      async (c) => {
        const scope = await resolveScope(c);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const access = resolveHumanInterviewReviewMutationAccess(scope, "edit");
        if (access) {
          return c.json({ error: access.message }, access.status);
        }
        const review = await loadHumanInterviewReview({
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
        });
        if (!review?.meetingSessionId) {
          return c.json({ error: "真人复面转录尚未就绪。" }, 409);
        }
        const result = await createHumanMeetingTranscriptRevision({
          actorId: scope.userId,
          correction: c.req.valid("json"),
          meetingId: review.meetingSessionId,
          organizationId: scope.organizationId,
        });
        const correctionError = z
          .enum(["conflict", "invalid-range", "not-found"])
          .safeParse(result);
        if (correctionError.success) {
          if (correctionError.data === "conflict") {
            return c.json({ error: "会议转录已变化，请刷新后重试。" }, 409);
          }
          if (correctionError.data === "not-found") {
            return c.json({ error: "会议转录不存在。" }, 404);
          }
          return c.json({ error: "会议转录时间范围无效。" }, 400);
        }
        await requestHumanInterviewEvaluationAfterTranscriptCorrection({
          meetingSessionId: review.meetingSessionId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
        });
        return c.json(result, 201);
      },
    )
    .post(
      "/:inviteToken/transcript-manual",
      bodyLimit({
        maxSize: 2 * 1024 * 1024,
        onError: (c) => c.json({ error: "人工补录内容过大。" }, 413),
      }),
      zValidator(
        "json",
        z.object({ text: z.string().trim().min(1).max(MAX_MEETING_TRANSCRIPT_TEXT_CHARS) }),
        jsonValidatorError("人工补录内容无效。"),
      ),
      async (c) => {
        const scope = await resolveScope(c);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const access = resolveHumanInterviewReviewMutationAccess(scope, "edit");
        if (access) {
          return c.json({ error: access.message }, access.status);
        }
        const review = await loadHumanInterviewReview({
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
        });
        if (!review?.meetingSessionId) {
          return c.json({ error: "真人复面录音尚未进入处理流程。" }, 409);
        }
        const result = await createInitialHumanMeetingTranscriptRevision({
          actorId: scope.userId,
          meetingId: review.meetingSessionId,
          organizationId: scope.organizationId,
          text: c.req.valid("json").text,
        });
        const manualError = z.enum(["conflict", "not-found", "not-ready"]).safeParse(result);
        if (manualError.success) {
          if (manualError.data === "conflict") {
            return c.json({ error: "会议转录已生成，请刷新后直接修改。" }, 409);
          }
          if (manualError.data === "not-found") {
            return c.json({ error: "会议转录不存在。" }, 404);
          }
          return c.json({ error: "录音处理信息尚未就绪，暂时无法人工补录。" }, 409);
        }
        await requestAutomaticHumanInterviewEvaluation({
          meetingSessionId: review.meetingSessionId,
          organizationId: scope.organizationId,
        });
        return c.json(result, 201);
      },
    )
    .post(
      "/:inviteToken/evaluation-draft",
      zValidator(
        "json",
        humanInterviewEvaluationDraftSaveSchema,
        jsonValidatorError("真人复面评价草稿无效。"),
      ),
      async (c) => {
        const scope = await resolveScope(c);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const access = resolveHumanInterviewReviewMutationAccess(scope, "edit");
        if (access) {
          return c.json({ error: access.message }, access.status);
        }
        const review = await loadHumanInterviewReview({
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
        });
        if (!review) {
          return c.json({ error: "真人复面复核内容不存在。" }, 404);
        }
        const input = c.req.valid("json");
        if (
          input.transcriptRevisionId !== null &&
          review.transcript?.id !== input.transcriptRevisionId
        ) {
          return c.json({ error: "转录已更新，请刷新后重新保存评价草稿。" }, 409);
        }
        const saved = await saveHumanInterviewEvaluationDraft({
          actorId: scope.userId,
          evaluation: input.evaluation,
          meetingSessionId: review.meetingSessionId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
          transcriptRevisionId: input.transcriptRevisionId,
        });
        return saved
          ? c.json({ ok: true }, 200)
          : c.json({ error: "本轮已提交、已结束或转录已更新，请刷新后查看。" }, 409);
      },
    )
    .post(
      "/:inviteToken/evaluation-regenerate",
      zValidator(
        "json",
        z.object({ confirmOverwrite: z.literal(true) }),
        jsonValidatorError("必须确认覆盖当前评价草稿。"),
      ),
      async (c) => {
        const scope = await resolveScope(c);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const access = resolveHumanInterviewReviewMutationAccess(scope, "edit");
        if (access) {
          return c.json({ error: access.message }, access.status);
        }
        const review = await loadHumanInterviewReview({
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
        });
        if (!review?.meetingSessionId) {
          return c.json({ error: "真人复面转录尚未就绪。" }, 409);
        }
        const requested = await requestManualHumanInterviewEvaluation({
          meetingSessionId: review.meetingSessionId,
          organizationId: scope.organizationId,
        });
        return requested
          ? c.json({ state: "generating" }, 202)
          : c.json({ error: "当前无法重新生成评价。" }, 409);
      },
    )
    .post("/:inviteToken/transcription-retry", async (c) => {
      const scope = await resolveScope(c);
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      const access = resolveHumanInterviewReviewMutationAccess(scope, "edit");
      if (access) {
        return c.json({ error: access.message }, access.status);
      }
      const review = await loadHumanInterviewReview({
        meetingId: scope.meetingId,
        organizationId: scope.organizationId,
        roundId: scope.roundId,
      });
      if (!review?.meetingSessionId) {
        return c.json({ error: "真人复面录音尚未进入处理流程。" }, 409);
      }
      const state = await retryHumanInterviewTranscription({
        meetingSessionId: review.meetingSessionId,
        organizationId: scope.organizationId,
      });
      return state === "processing"
        ? c.json({ state }, 202)
        : c.json({ error: "转录服务暂不可用。" }, 503);
    })
    .post(
      "/:inviteToken/evaluation-submit",
      zValidator(
        "json",
        z.object({
          evaluation: humanInterviewEvaluationSchema,
          outcome: humanInterviewFinalOutcomeSchema,
          transcriptRevisionId: z.uuid().nullable(),
        }),
        jsonValidatorError("真人复面评价提交参数无效。"),
      ),
      async (c) => {
        const scope = await resolveScope(c);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const access = resolveHumanInterviewReviewMutationAccess(scope, "submit");
        if (access) {
          return c.json({ error: access.message }, access.status);
        }
        const input = c.req.valid("json");
        const review = await loadHumanInterviewReview({
          meetingId: scope.meetingId,
          organizationId: scope.organizationId,
          roundId: scope.roundId,
        });
        if (!review) {
          return c.json({ error: "真人复面复核内容不存在。" }, 404);
        }
        const submitted = await submitAndFinalizeHumanInterviewEvaluation({
          actorId: scope.userId,
          evaluation: input.evaluation,
          meetingSessionId: review.meetingSessionId,
          organizationId: scope.organizationId,
          outcome: input.outcome,
          roundId: scope.roundId,
          transcriptRevisionId: input.transcriptRevisionId,
        });
        return submitted
          ? c.json({ ok: true }, 200)
          : c.json({ error: "本轮已提交、已结束或转录已更新，请刷新后查看。" }, 409);
      },
    );
}
