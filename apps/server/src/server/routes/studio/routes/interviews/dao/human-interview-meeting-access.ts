import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { getRequiredEnv } from "@server/lib/server/env";

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EARLY_JOIN_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_VALID_DURATION_MS = 60 * 60 * 1000;

const candidateInvitePayloadSchema = z.object({
  exp: z.number().int().positive(),
  meetingId: z.string().trim().min(1),
  roundId: z.string().trim().min(1),
});

const interviewerInvitePayloadSchema = z.object({
  exp: z.number().int().positive(),
  meetingId: z.string().trim().min(1),
  role: z.enum(["host", "interviewer", "observer"]),
  userId: z.string().trim().min(1),
});

const signedInvitePayloadSchema = z.union([
  candidateInvitePayloadSchema,
  interviewerInvitePayloadSchema,
]);

export type CandidateInvitePayload = z.infer<typeof candidateInvitePayloadSchema>;
export type InterviewerInvitePayload = z.infer<typeof interviewerInvitePayloadSchema>;

export class HumanInterviewMeetingError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 410 | 500;

  constructor(message: string, status: 400 | 403 | 404 | 409 | 410 | 500) {
    super(message);
    this.name = "HumanInterviewMeetingError";
    this.status = status;
  }
}

export function buildHumanInterviewRoomName(meetingId: string): string {
  return `human_${meetingId}_${Math.floor(Math.random() * 10_000)}`;
}

export function resolveValidUntilInput({
  scheduledAt,
  validUntil,
  existingValidUntil,
}: {
  scheduledAt: Date | null;
  validUntil: string | null | undefined;
  existingValidUntil?: Date | null;
}): Date | null {
  if (!scheduledAt) {
    return validUntil ? new Date(validUntil) : null;
  }

  let resolved: Date;
  if (validUntil === undefined) {
    resolved = existingValidUntil ?? new Date(scheduledAt.getTime() + DEFAULT_VALID_DURATION_MS);
  } else if (validUntil) {
    resolved = new Date(validUntil);
  } else {
    resolved = new Date(scheduledAt.getTime() + DEFAULT_VALID_DURATION_MS);
  }

  if (Number.isNaN(resolved.getTime())) {
    throw new HumanInterviewMeetingError("请输入有效的有效时间至。", 400);
  }
  if (resolved.getTime() <= scheduledAt.getTime()) {
    throw new HumanInterviewMeetingError("有效时间至必须晚于面试时间。", 400);
  }
  return resolved;
}

function getInviteSecret(): string {
  try {
    return getRequiredEnv("BETTER_AUTH_SECRET");
  } catch {
    throw new HumanInterviewMeetingError("邀请链接签名密钥未配置。", 500);
  }
}

function signInvitePayload(encodedPayload: string): string {
  return createHmac("sha256", getInviteSecret()).update(encodedPayload).digest("base64url");
}

function buildSignedInviteToken(payload: CandidateInvitePayload | InterviewerInvitePayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  return `${encodedPayload}.${signInvitePayload(encodedPayload)}`;
}

export function buildCandidateInviteToken(payload: CandidateInvitePayload): string {
  return buildSignedInviteToken(payload);
}

export function buildInterviewerInviteToken(payload: InterviewerInvitePayload): string {
  return buildSignedInviteToken(payload);
}

export function buildInviteExpiry(now = Date.now()): number {
  return now + INVITE_TTL_MS;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function decodeSignedInviteToken(token: string): z.infer<typeof signedInvitePayloadSchema> | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    return null;
  }
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(signInvitePayload(encodedPayload));
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = signedInvitePayloadSchema.safeParse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function verifyCandidateInviteToken(token: string): CandidateInvitePayload | null {
  const parsed = candidateInvitePayloadSchema.safeParse(decodeSignedInviteToken(token));
  return parsed.success && parsed.data.exp >= Date.now() ? parsed.data : null;
}

export function decodeCandidateInviteToken(token: string): CandidateInvitePayload | null {
  const parsed = candidateInvitePayloadSchema.safeParse(decodeSignedInviteToken(token));
  return parsed.success ? parsed.data : null;
}

export function verifyInterviewerInviteToken(token: string): InterviewerInvitePayload | null {
  const parsed = interviewerInvitePayloadSchema.safeParse(decodeSignedInviteToken(token));
  return parsed.success && parsed.data.exp >= Date.now() ? parsed.data : null;
}

export function isHumanInterviewMeetingBeforeScheduledStart(
  scheduledAt: string | null,
  nowInput: string | number | Date = Date.now(),
): boolean {
  if (!scheduledAt) {
    return false;
  }
  const start = new Date(scheduledAt);
  const now = new Date(nowInput);
  return (
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(now.getTime()) &&
    start.getTime() - EARLY_JOIN_WINDOW_MS > now.getTime()
  );
}

export function isHumanInterviewMeetingAfterValidUntil(
  validUntil: string | null,
  nowInput: string | number | Date = Date.now(),
): boolean {
  if (!validUntil) {
    return true;
  }
  const end = new Date(validUntil);
  const now = new Date(nowInput);
  return (
    !Number.isNaN(end.getTime()) && !Number.isNaN(now.getTime()) && end.getTime() < now.getTime()
  );
}
