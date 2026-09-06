import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";
import {
  enqueueAiInvitationExceptionEvent,
  enqueueAiInvitationResponseEvent,
  resolveInterviewNotificationCompanyName,
} from "../../../../../interview-notifications/utils/events";
import { globalConfig, organization, aiInterviewRound } from "@app/db-schema/schema";
import type { AiInvitationExceptionType } from "@app/db-schema/interview-notifications";
import type { PublicAiInterviewInvitationPreview } from "@app/shared/studio-pipeline-stages";
import { buildInterviewLink } from "@app/shared/interview/interview-record";
import {
  hashAiInterviewInvitationToken,
  isAiInterviewInvitationExpired,
  parseSignedAiInterviewInvitationToken,
} from "./ai-interview-invitation-access";

export type AiInterviewInvitationErrorCode =
  | "invalid_link"
  | "invitation_expired"
  | "response_conflict";

export class AiInterviewInvitationError extends Error {
  readonly code: AiInterviewInvitationErrorCode;
  readonly status: 400 | 404 | 409 | 410;

  constructor(
    message: string,
    status: 400 | 404 | 409 | 410,
    code: AiInterviewInvitationErrorCode,
  ) {
    super(message);
    this.name = "AiInterviewInvitationError";
    this.code = code;
    this.status = status;
  }
}

export async function recordAiInterviewInvitationException(input: {
  exceptionType: AiInvitationExceptionType;
  occurredAt?: Date;
  token: string;
}): Promise<boolean> {
  if (!isInterviewNotificationFlowEnabled()) {
    return false;
  }
  const payload = parseSignedAiInterviewInvitationToken(input.token);
  if (!payload) {
    return false;
  }
  const tokenHash = hashAiInterviewInvitationToken(input.token);
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ tokenHash: aiInterviewRound.candidateInviteTokenHash })
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, payload.scheduleEntryId))
      .limit(1)
      .for("update");
    if (row?.tokenHash !== tokenHash) {
      return false;
    }
    await enqueueAiInvitationExceptionEvent(tx, {
      exceptionType: input.exceptionType,
      occurredAt: input.occurredAt,
      scheduleEntryId: payload.scheduleEntryId,
    });
    return true;
  });
}

export async function previewAiInterviewInvitation(
  token: string,
): Promise<PublicAiInterviewInvitationPreview | null> {
  const payload = parseSignedAiInterviewInvitationToken(token);
  if (!payload) {
    return null;
  }
  const [row] = await db
    .select({
      candidateName: recruitingRecordReadModel.candidateName,
      configuredCompanyName: globalConfig.companyName,
      expiresAt: aiInterviewRound.candidateInviteExpiresAt,
      jobName: recruitingRecordReadModel.targetRole,
      roundName: aiInterviewRound.roundLabel,
      scheduledAt: aiInterviewRound.scheduledAt,
      status: aiInterviewRound.candidateInviteStatus,
      tokenHash: aiInterviewRound.candidateInviteTokenHash,
      workspaceName: organization.name,
    })
    .from(aiInterviewRound)
    .innerJoin(
      recruitingRecordReadModel,
      eq(recruitingRecordReadModel.id, aiInterviewRound.recruitingRecordId),
    )
    .innerJoin(organization, eq(organization.id, aiInterviewRound.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, aiInterviewRound.organizationId))
    .where(eq(aiInterviewRound.id, payload.scheduleEntryId))
    .limit(1);
  if (!row?.expiresAt || row.tokenHash !== hashAiInterviewInvitationToken(token)) {
    return null;
  }
  const expired = isAiInterviewInvitationExpired(row.expiresAt);
  if (expired) {
    await recordAiInterviewInvitationException({
      exceptionType: "invitation_expired",
      token,
    }).catch((error) => {
      console.error("[ai-invitation-expired-notification] failed", { error });
    });
  }
  return {
    candidateName: row.candidateName,
    companyName: resolveInterviewNotificationCompanyName(
      row.configuredCompanyName,
      row.workspaceName,
    ),
    expiresAt: row.expiresAt.toISOString(),
    jobName: row.jobName,
    roundName: row.roundName,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    status: expired ? "expired" : row.status,
  };
}

export async function respondAiInterviewInvitation(input: {
  action: "accept" | "decline";
  declineReason?: string | null;
  token: string;
}): Promise<
  { interviewUrl: string; status: "accepted" } | { interviewUrl: null; status: "declined" }
> {
  const payload = parseSignedAiInterviewInvitationToken(input.token);
  if (!payload) {
    throw new AiInterviewInvitationError(
      "面试邀请链接无效，请检查链接是否完整，或联系招聘负责人重新获取邀请。",
      404,
      "invalid_link",
    );
  }
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        expiresAt: aiInterviewRound.candidateInviteExpiresAt,
        interviewRecordId: aiInterviewRound.recruitingRecordId,
        invitationVersion: aiInterviewRound.invitationVersion,
        status: aiInterviewRound.candidateInviteStatus,
        tokenHash: aiInterviewRound.candidateInviteTokenHash,
      })
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, payload.scheduleEntryId))
      .limit(1)
      .for("update");
    if (
      !row ||
      isAiInterviewInvitationExpired(row.expiresAt, now) ||
      row.tokenHash !== hashAiInterviewInvitationToken(input.token) ||
      row.status === "expired"
    ) {
      throw new AiInterviewInvitationError(
        "该面试邀请已经过期，暂时无法完成确认。请联系招聘负责人重新发起邀请。",
        410,
        "invitation_expired",
      );
    }
    const nextStatus: "accepted" | "declined" = input.action === "accept" ? "accepted" : "declined";
    if (row.status !== nextStatus) {
      if (row.status === "accepted" || row.status === "declined") {
        const message =
          row.status === "declined"
            ? "您之前已经拒绝本次面试，无法直接重新接受。如需调整，请联系招聘负责人。"
            : "您之前已经接受本次面试，无法直接改为拒绝。如需调整，请联系招聘负责人。";
        throw new AiInterviewInvitationError(message, 409, "response_conflict");
      }
      await tx
        .update(aiInterviewRound)
        .set({
          candidateDeclineReason:
            input.action === "decline" ? input.declineReason?.trim() || null : null,
          candidateInviteStatus: nextStatus,
          candidateRespondedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiInterviewRound.id, payload.scheduleEntryId),
            eq(aiInterviewRound.invitationVersion, row.invitationVersion),
          ),
        );
      if (isInterviewNotificationFlowEnabled()) {
        await enqueueAiInvitationResponseEvent(tx, {
          action: input.action,
          invitationVersion: row.invitationVersion,
          respondedAt: now,
          scheduleEntryId: payload.scheduleEntryId,
        });
      }
    }
    return nextStatus === "accepted"
      ? {
          interviewUrl: buildInterviewLink(row.interviewRecordId, payload.scheduleEntryId),
          status: nextStatus,
        }
      : { interviewUrl: null, status: nextStatus };
  });
  return result;
}
