import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRequiredEnv } from "@app/server/lib/server/env";
import type { AiInterviewLinkValidity } from "@arc/shared/interview/ai-interview-invitation";

const DAY_MS = 24 * 60 * 60 * 1000;
const AI_INVITATION_TTL_MS = 30 * DAY_MS;
const CONFIGURED_VALIDITY_DAYS = {
  "1_day": 1,
  "3_days": 3,
  "7_days": 7,
} as const satisfies Record<Exclude<AiInterviewLinkValidity, "permanent">, number>;

const aiInvitationPayloadSchema = z.object({
  exp: z.number().int().positive(),
  kind: z.literal("ai_candidate_invite"),
  scheduleEntryId: z.string().trim().min(1),
});

export type AiInterviewInvitationPayload = z.infer<typeof aiInvitationPayloadSchema>;

function signature(encodedPayload: string): string {
  return createHmac("sha256", getRequiredEnv("BETTER_AUTH_SECRET"))
    .update(encodedPayload)
    .digest("base64url");
}

export function buildAiInterviewInvitationExpiry(now = Date.now()): number {
  return now + AI_INVITATION_TTL_MS;
}

export function buildAiInterviewInvitationToken(
  payload: Omit<AiInterviewInvitationPayload, "kind">,
): string {
  const encoded = Buffer.from(
    JSON.stringify({ ...payload, kind: "ai_candidate_invite" }),
    "utf-8",
  ).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function hashAiInterviewInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseSignedAiInterviewInvitationToken(
  token: string,
): AiInterviewInvitationPayload | null {
  const [encoded, providedSignature, extra] = token.split(".");
  if (!encoded || !providedSignature || extra) {
    return null;
  }
  const actual = Buffer.from(providedSignature);
  const expected = Buffer.from(signature(encoded));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const parsed = aiInvitationPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function verifyAiInterviewInvitationToken(
  token: string,
): AiInterviewInvitationPayload | null {
  const payload = parseSignedAiInterviewInvitationToken(token);
  return payload && payload.exp >= Date.now() ? payload : null;
}

export function isAiInterviewInvitationExpired(expiresAt: Date | null, now = new Date()): boolean {
  return !expiresAt || expiresAt <= now;
}

export function addAiInterviewInvitationToSchedule<T extends { id: string }>(
  schedule: T,
  now: Date,
): T & {
  candidateInviteExpiresAt: Date;
  candidateInviteTokenHash: string;
} {
  const expiresAt = new Date(buildAiInterviewInvitationExpiry(now.getTime()));
  const token = buildAiInterviewInvitationToken({
    exp: expiresAt.getTime(),
    scheduleEntryId: schedule.id,
  });
  return {
    ...schedule,
    candidateInviteExpiresAt: expiresAt,
    candidateInviteTokenHash: hashAiInterviewInvitationToken(token),
  };
}

export function applyAiInterviewInvitationValidityToSchedule<T extends { id: string }>(
  schedule: T,
  now: Date,
  validity: AiInterviewLinkValidity,
): T & {
  candidateInviteExpiresAt: Date | null;
  candidateInviteTokenHash: string | null;
} {
  if (validity === "permanent") {
    return {
      ...schedule,
      candidateInviteExpiresAt: null,
      candidateInviteTokenHash: null,
    };
  }

  const expiresAt = new Date(now.getTime() + CONFIGURED_VALIDITY_DAYS[validity] * DAY_MS);
  const token = buildAiInterviewInvitationToken({
    exp: expiresAt.getTime(),
    scheduleEntryId: schedule.id,
  });
  return {
    ...schedule,
    candidateInviteExpiresAt: expiresAt,
    candidateInviteTokenHash: hashAiInterviewInvitationToken(token),
  };
}

export function buildResetAiInterviewInvitation(input: {
  currentTokenHash: string | null;
  invitationVersion: number;
  now: Date;
}) {
  return {
    candidateDeclineReason: null,
    candidateInviteExpiresAt: input.currentTokenHash
      ? new Date(buildAiInterviewInvitationExpiry(input.now.getTime()))
      : null,
    candidateInviteStatus: "pending" as const,
    candidateInviteTokenHash: input.currentTokenHash,
    candidateRespondedAt: null,
    invitationVersion: input.invitationVersion + 1,
  };
}
