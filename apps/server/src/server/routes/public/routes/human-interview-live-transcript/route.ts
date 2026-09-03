import { createMeetingLiveTranscriptHints } from "@app/meeting-live-transcript/hints";
import { createMeetingLiveTranscriptAuthorizationSchema } from "@app/shared/meeting-transcription";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../factory";
import { LiveTranscriptAuthorizationRateLimitError } from "../../../meetings/routes/live-transcript/authorization-gate";
import {
  createWorkspaceMeetingLiveTranscriptAuthorization,
  heartbeatWorkspaceMeetingLiveTranscript,
  releaseWorkspaceMeetingLiveTranscript,
} from "../../../meetings/routes/live-transcript/service";
import {
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
} from "../../../studio/routes/interviews/dao/human-interview-meeting-access";
import { resolveHumanInterviewMeetingInterviewerInviteToken } from "../../../studio/routes/interviews/dao/human-interview-meetings";

const leaseParamSchema = z.object({ captureId: z.uuid(), inviteToken: z.string().min(1) });
const inviteParamSchema = z.object({ inviteToken: z.string().min(1) });

type InterviewerScope = NonNullable<
  Awaited<ReturnType<typeof resolveHumanInterviewMeetingInterviewerInviteToken>>
>;

interface Dependencies {
  createAuthorization: typeof createWorkspaceMeetingLiveTranscriptAuthorization;
  heartbeat: typeof heartbeatWorkspaceMeetingLiveTranscript;
  now: () => Date;
  release: typeof releaseWorkspaceMeetingLiveTranscript;
  resolveInvite: (inviteToken: string) => Promise<InterviewerScope | null>;
}

const defaultDependencies: Dependencies = {
  createAuthorization: createWorkspaceMeetingLiveTranscriptAuthorization,
  heartbeat: heartbeatWorkspaceMeetingLiveTranscript,
  now: () => new Date(),
  release: releaseWorkspaceMeetingLiveTranscript,
  resolveInvite: resolveHumanInterviewMeetingInterviewerInviteToken,
};

function activeInterviewerError(scope: InterviewerScope, now: Date): string | null {
  if (scope.role === "observer") {
    return "observer";
  }
  if (scope.status === "cancelled" || scope.status === "ended") {
    return "ended";
  }
  if (
    scope.status === "scheduled" &&
    isHumanInterviewMeetingBeforeScheduledStart(scope.scheduledAt, now)
  ) {
    return "early";
  }
  if (isHumanInterviewMeetingAfterValidUntil(scope.validUntil, now)) {
    return "expired";
  }
  return null;
}

export function createHumanInterviewLiveTranscriptRouter(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .post(
      "/:inviteToken/live-transcript",
      zValidator("param", inviteParamSchema, jsonValidatorError("真人复面邀请凭证无效")),
      zValidator(
        "json",
        createMeetingLiveTranscriptAuthorizationSchema,
        jsonValidatorError("实时字幕授权请求无效"),
      ),
      async (c) => {
        const input = c.req.valid("json");
        const scope = await dependencies.resolveInvite(c.req.valid("param").inviteToken);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const accessError = activeInterviewerError(scope, dependencies.now());
        if (accessError === "observer") {
          return c.json({ error: "旁听人员不能开启实时字幕。" }, 403);
        }
        if (accessError === "ended") {
          return c.json({ error: "该真人复面会议已结束或取消。" }, 403);
        }
        if (accessError === "early") {
          return c.json({ error: "真人复面尚未到可进入时间。" }, 403);
        }
        if (accessError === "expired") {
          return c.json({ error: "该真人复面会议已超过有效时间。" }, 403);
        }

        try {
          const authorization = await dependencies.createAuthorization({
            captureId: input.captureId,
            organizationId: scope.organizationId,
            track: input.track,
            userId: scope.userId,
          });
          if (authorization === "unavailable") {
            return c.json({ error: "实时字幕服务暂不可用。" }, 503);
          }
          if (authorization === "capacity") {
            c.header("Retry-After", "30");
            return c.json({ error: "实时字幕容量已满，请稍后重试。" }, 429);
          }
          c.header("Cache-Control", "no-store");
          return c.json(
            {
              authorization: {
                ...authorization,
                ...createMeetingLiveTranscriptHints({
                  candidateName: scope.candidateName,
                  jobDescriptionDepartmentName: scope.jobDescriptionDepartmentName,
                  jobDescriptionName: scope.jobDescriptionName,
                  resumeSkills: scope.resumeSkills,
                  targetRole: scope.targetRole,
                }),
              },
            },
            201,
          );
        } catch (error) {
          if (error instanceof LiveTranscriptAuthorizationRateLimitError) {
            c.header("Retry-After", String(error.retryAfterSeconds));
            return c.json({ error: "实时字幕授权请求过于频繁。" }, 429);
          }
          console.error("[human-interview-live-transcript] authorization failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          return c.json({ error: "实时字幕服务暂不可用。" }, 502);
        }
      },
    )
    .post(
      "/:inviteToken/live-transcript/:captureId/heartbeat",
      zValidator("param", leaseParamSchema, jsonValidatorError("实时字幕租约参数无效")),
      async (c) => {
        const params = c.req.valid("param");
        const scope = await dependencies.resolveInvite(params.inviteToken);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        const accessError = activeInterviewerError(scope, dependencies.now());
        if (accessError) {
          return c.json({ error: "实时字幕租约不可续期。" }, 403);
        }
        const renewed = await dependencies.heartbeat({
          captureId: params.captureId,
          organizationId: scope.organizationId,
          userId: scope.userId,
        });
        if (!renewed) {
          return c.json({ error: "实时字幕租约已失效。" }, 409);
        }
        return c.body(null, 204);
      },
    )
    .delete(
      "/:inviteToken/live-transcript/:captureId",
      zValidator("param", leaseParamSchema, jsonValidatorError("实时字幕租约参数无效")),
      async (c) => {
        const params = c.req.valid("param");
        const scope = await dependencies.resolveInvite(params.inviteToken);
        if (!scope) {
          return c.json({ error: "真人复面链接不可用。" }, 404);
        }
        await dependencies.release({
          captureId: params.captureId,
          organizationId: scope.organizationId,
          userId: scope.userId,
        });
        return c.body(null, 204);
      },
    );
}

export const humanInterviewLiveTranscriptRouter = createHumanInterviewLiveTranscriptRouter();
