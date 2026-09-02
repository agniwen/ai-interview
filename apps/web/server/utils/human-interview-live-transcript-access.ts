import { Buffer } from "node:buffer";
import { createMeetingLiveTranscriptHints } from "@app/meeting-live-transcript/hints";
import type { MeetingLiveTranscriptAuthorization } from "@app/shared/meeting-transcription";
import { meetingLiveTranscriptTrackSchema } from "@app/shared/meeting-transcription";
import {
  createWorkspaceMeetingLiveTranscriptAuthorization,
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
  resolveHumanInterviewMeetingInterviewerInviteToken,
} from "@app/server/web/human-interview";
import { z } from "zod";

const captureIdSchema = z.string().uuid();
const sectionIdSchema = z.string().min(1).max(512);

type InterviewerScope = NonNullable<
  Awaited<ReturnType<typeof resolveHumanInterviewMeetingInterviewerInviteToken>>
>;

export interface HumanInterviewLiveTranscriptContext extends Record<string, unknown> {
  authorization: MeetingLiveTranscriptAuthorization;
  captureId: string;
  organizationId: string;
  sectionId: string;
  track: "microphone" | "system";
  userId: string;
}

interface Dependencies {
  createAuthorization: typeof createWorkspaceMeetingLiveTranscriptAuthorization;
  now: () => Date;
  resolveInvite: (inviteToken: string) => Promise<InterviewerScope | null>;
}

const defaultDependencies: Dependencies = {
  createAuthorization: createWorkspaceMeetingLiveTranscriptAuthorization,
  now: () => new Date(),
  resolveInvite: resolveHumanInterviewMeetingInterviewerInviteToken,
};

function reject(status: number, message: string): never {
  throw new Response(message, { status });
}

function protocolValue(protocols: string[], prefix: string): string {
  const protocol = protocols.find((candidate) => candidate.startsWith(prefix));
  if (!protocol) {
    return reject(400, "实时字幕连接参数不完整。");
  }
  return protocol.slice(prefix.length);
}

function decodeInviteToken(encoded: string): string {
  try {
    const token = Buffer.from(encoded, "base64url").toString("utf-8");
    if (!token || token.length > 4096) {
      return reject(400, "实时字幕邀请凭证无效。");
    }
    return token;
  } catch {
    return reject(400, "实时字幕邀请凭证无效。");
  }
}

function validateOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    reject(403, "实时字幕连接来源无效。");
  }
}

export async function authorizeHumanInterviewLiveTranscriptUpgrade(
  request: Request,
  dependencies: Partial<Dependencies> = {},
): Promise<HumanInterviewLiveTranscriptContext> {
  validateOrigin(request);
  const deps = { ...defaultDependencies, ...dependencies };
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim());
  if (!protocols.includes("arc-human-interview-transcript")) {
    reject(400, "实时字幕协议无效。");
  }
  const inviteToken = decodeInviteToken(protocolValue(protocols, "arc-invite."));
  const captureId = captureIdSchema.safeParse(protocolValue(protocols, "arc-capture."));
  const track = meetingLiveTranscriptTrackSchema.safeParse(protocolValue(protocols, "arc-track."));
  const sectionId = sectionIdSchema.safeParse(
    decodeInviteToken(protocolValue(protocols, "arc-section.")),
  );
  if (
    !(captureId.success && track.success && sectionId.success) ||
    !sectionId.data.startsWith(`${captureId.data}:${track.data}:`)
  ) {
    reject(400, "实时字幕连接参数无效。");
  }
  const scope = await deps.resolveInvite(inviteToken);
  if (!scope) {
    reject(401, "真人复面链接不可用。");
  }
  if (scope.role === "observer") {
    reject(403, "旁听人员不能开启实时字幕。");
  }
  if (scope.status === "cancelled" || scope.status === "ended") {
    reject(403, "该真人复面会议已结束或取消。");
  }
  const now = deps.now();
  if (
    scope.status === "scheduled" &&
    isHumanInterviewMeetingBeforeScheduledStart(scope.scheduledAt, now)
  ) {
    reject(403, "真人复面尚未到可进入时间。");
  }
  if (isHumanInterviewMeetingAfterValidUntil(scope.validUntil, now)) {
    reject(403, "该真人复面会议已超过有效时间。");
  }
  const authorization = await deps.createAuthorization({
    captureId: captureId.data,
    organizationId: scope.organizationId,
    track: track.data,
    userId: scope.userId,
  });
  if (authorization === "capacity") {
    reject(429, "实时字幕容量已满，请稍后重试。");
  }
  if (authorization === "unavailable") {
    reject(503, "实时字幕服务暂不可用。");
  }
  const hints = createMeetingLiveTranscriptHints({
    candidateName: scope.candidateName,
    jobDescriptionDepartmentName: scope.jobDescriptionDepartmentName,
    jobDescriptionName: scope.jobDescriptionName,
    resumeSkills: scope.resumeSkills,
    targetRole: scope.targetRole,
  });
  return {
    authorization: { ...authorization, ...hints },
    captureId: captureId.data,
    organizationId: scope.organizationId,
    sectionId: sectionId.data,
    track: track.data,
    userId: scope.userId,
  };
}
