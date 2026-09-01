/* oxlint-disable anti-slop/no-conditional-empty-object-spread, anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion, class-methods-use-this, complexity, max-lines, no-negated-condition, no-nested-ternary, prefer-destructuring, require-await, typescript/no-non-null-assertion, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/no-nested-ternary, unicorn/prefer-structured-clone -- Public invitation, material, referral, and meeting flows preserve one copied authorization and token-validity boundary; provider payload normalization and optional response fields mirror the legacy wire contract. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import {
  candidateFormSubmission,
  chatAttachment,
  department,
  globalConfig,
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  interviewNotification,
  jobDescription,
  minimaxVoicePreview,
  organization,
  referralLink,
  resumeDuplicateMatch,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewSchedule,
  studioOfferDraft,
  user,
} from "@arc/db-schema/schema";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import {
  qualitativeResumeEvaluationSchema,
  qualitativeResumeEvaluationV1Schema,
  qualitativeResumeEvaluationV2Schema,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import { studioInterviewQuestionClientSchema } from "@arc/db-schema/studio-interviews";
import { humanInterviewCandidateHrEvaluationSchema } from "@arc/shared/human-interview-candidate-materials";
import { buildInterviewLink } from "@arc/shared/interview/interview-record";
import { buildInterviewNotificationDedupeKey } from "@arc/shared/interview-notifications";
import { hasExistingInterviewAnswers } from "@arc/shared/interview/question-outcomes";
import { deriveJdRequiredSkills, resumeScreeningResultSchema } from "@arc/shared/resume-screening";
import { resumeReviewActionSchema } from "@arc/shared/resume-review";
import { formatResumeEducationSchoolWithLevel } from "@arc/shared/resume-education";
import type { Request } from "express";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelBinaryResponse, TopLevelDatabasePort } from "../top-level.ports.js";
import { enqueuePreparedNotificationEvent } from "../notification-preparation.js";
import type { TopLevelPublicPort } from "./public.port.js";
import { buildPublicConversationReport } from "./public-report.js";
import type { invitationResponseSchema } from "./public.schemas.js";

const signedTokenSchema = z.union([
  z.object({
    exp: z.number().int().positive(),
    kind: z.literal("ai_candidate_invite"),
    scheduleEntryId: z.string().min(1),
  }),
  z.object({
    exp: z.number().int().positive(),
    meetingId: z.string().min(1),
    roundId: z.string().min(1),
  }),
  z.object({
    exp: z.number().int().positive(),
    meetingId: z.string().min(1),
    role: z.enum(["host", "interviewer", "observer"]),
    userId: z.string().min(1),
  }),
]);
const resumeReviewProjectionSchema = z
  .object({
    nextStep: z.object({ action: z.string().optional() }).passthrough().optional(),
    overall: z
      .object({
        baseScore: z.union([z.number(), z.string()]).optional(),
        conclusion: z.string().optional(),
        score: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type SignedToken = z.infer<typeof signedTokenSchema>;
type CandidateScope = Awaited<ReturnType<PublicService["resolveCandidateMeeting"]>>;
type InterviewerScope = Awaited<ReturnType<PublicService["resolveInterviewerMeeting"]>>;
const candidateCreator = alias(user, "public_candidate_creator");
const duplicateCandidate = alias(studioInterview, "public_duplicate_candidate");
const duplicateCreator = alias(user, "public_duplicate_creator");

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InternalServerErrorException(`${name} is not configured`, {
      errorCode: "TOP_LEVEL_CONFIGURATION_MISSING",
    });
  }
  return value;
}

function parseSignedToken(token: string): SignedToken | null {
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) {
    return null;
  }
  const expectedSignature = createHmac("sha256", requiredEnvironment("BETTER_AUTH_SECRET"))
    .update(payload)
    .digest("base64url");
  const actual = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const parsed = signedTokenSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isBeforeJoinWindow(scheduledAt: Date | null) {
  return scheduledAt ? scheduledAt.getTime() - 5 * 60_000 > Date.now() : false;
}

function notificationFlowEnabled() {
  return ["1", "true", "yes"].includes(
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED?.trim().toLocaleLowerCase() ?? "",
  );
}

function absoluteAppUrl(pathname: string) {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return baseUrl ? `${baseUrl.replace(/\/$/u, "")}${pathname}` : undefined;
}

function binaryHeaders(input: {
  cacheControl: string;
  contentLength?: number;
  contentType?: string;
  fileName?: string | null;
}) {
  return {
    "Cache-Control": input.cacheControl,
    ...(input.fileName
      ? { "Content-Disposition": `inline; filename="${encodeURIComponent(input.fileName)}"` }
      : {}),
    ...(input.contentLength === undefined ? {} : { "Content-Length": String(input.contentLength) }),
    "Content-Type": input.contentType ?? "application/octet-stream",
  };
}

function serializeTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function compactResumeProfileSnapshot(value: unknown) {
  const parsed = resumeProfileSchema.safeParse(value);
  if (!parsed.success) {
    return {
      education: [],
      educationHasMore: false,
      projects: [],
      projectsHasMore: false,
      work: [],
      workHasMore: false,
    };
  }
  const recentFirst = <T extends { period?: string | null }>(rows: T[]) =>
    rows.toSorted((left, right) => (right.period ?? "").localeCompare(left.period ?? ""));
  const work = recentFirst(parsed.data.workExperiences).flatMap((item) => {
    const company = item.company?.trim();
    const role = item.role?.trim();
    const primary = company || role;
    return primary
      ? [{ period: item.period?.trim() || null, primary, secondary: company ? role || null : null }]
      : [];
  });
  const education = recentFirst(parsed.data.educationExperiences ?? []).flatMap((item) => {
    const school = item.school?.trim();
    if (!school) {
      return [];
    }
    return [
      {
        period: item.period?.trim() || item.graduationYear?.trim() || null,
        primary:
          formatResumeEducationSchoolWithLevel({
            educationLevel: item.educationLevel?.trim() || null,
            school,
          }) ?? school,
        secondary: item.major?.trim() || null,
      },
    ];
  });
  const projects = recentFirst(parsed.data.projectExperiences).flatMap((item) => {
    const name = item.name?.trim();
    return name
      ? [
          {
            period: item.period?.trim() || null,
            primary: name,
            secondary: item.role?.trim() || null,
          },
        ]
      : [];
  });
  return {
    education: education.slice(0, 3),
    educationHasMore: education.length > 3,
    projects: projects.slice(0, 3),
    projectsHasMore: projects.length > 3,
    work: work.slice(0, 3),
    workHasMore: work.length > 3,
  };
}

const execFileAsync = promisify(execFile);

async function convertPptxToPdf(bytes: Uint8Array) {
  const directory = await mkdtemp(path.join(tmpdir(), "arc-pptx-preview-"));
  const input = path.join(directory, "document.pptx");
  const output = path.join(directory, "document.pdf");
  try {
    await writeFile(input, bytes);
    await execFileAsync(
      process.env.LIBREOFFICE_BIN?.trim() || "soffice",
      ["--headless", "--convert-to", "pdf:impress_pdf_Export", "--outdir", directory, input],
      { maxBuffer: 1024 * 1024, timeout: 30_000 },
    );
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

@Injectable()
export class PublicService implements TopLevelPublicPort {
  private storage?: { bucket: string; client: S3Client };

  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
  ) {}

  async getReferral(token: string) {
    const link = await this.resolveReferral(token);
    return {
      companyName: link.organizationName,
      jobDescriptionCode: link.jobDescriptionCode,
      jobDescriptionName: link.jobDescriptionName,
      referrerName: link.referrerName,
    };
  }

  async uploadReferralResume(input: { request: Request; token: string }) {
    const link = await this.resolveReferral(input.token);
    const file = await this.readMultipartResume(input.request);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const extension = file.name.toLocaleLowerCase().endsWith(".docx") ? "docx" : "pdf";
    const storageKey = `attachments/${contentHash.slice(0, 2)}/${contentHash}.${extension}`;
    const storage = this.getStorage();
    await storage.client.send(
      new PutObjectCommand({
        Body: bytes,
        Bucket: storage.bucket,
        ContentType: file.type || "application/octet-stream",
        Key: storageKey,
      }),
    );
    const batchId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(chatAttachment).values({
        contentHash,
        filename: file.name.slice(0, 255),
        id: crypto.randomUUID(),
        mediaType: file.type || "application/octet-stream",
        organizationId: link.organizationId,
        parsedStatus: "pending",
        size: file.size,
        storageKey,
        userId: link.createdBy,
      });
      await transaction.insert(resumeUploadBatch).values({
        createdBy: link.createdBy,
        dedupPolicy: "create",
        id: batchId,
        jdMode: "bind",
        jobDescriptionId: link.jobDescriptionId,
        organizationId: link.organizationId,
        resumePoolScope: "public",
        status: "running",
        target: "resume_pool",
        totalCount: 1,
      });
      await transaction.insert(resumeUploadBatchItem).values({
        batchId,
        contentHash,
        fileSize: file.size,
        id: itemId,
        orderIndex: 0,
        organizationId: link.organizationId,
        originalFileName: file.name,
        status: "pending",
        storageKey,
      });
    });
    try {
      const { enqueueResumeParseJobs, isResumeParseQueueConfigured } =
        await import("@arc/resume-parse-queue/resume-parse");
      if (!isResumeParseQueueConfigured()) {
        throw new Error("queue unavailable");
      }
      await enqueueResumeParseJobs([
        { batchId, itemId, organizationId: link.organizationId, userId: link.createdBy },
      ]);
    } catch {
      await this.database
        .update(resumeUploadBatch)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(resumeUploadBatch.id, batchId));
      throw new ServiceUnavailableException("Resume parsing is temporarily unavailable", {
        errorCode: "RESUME_PARSE_QUEUE_UNAVAILABLE",
      });
    }
    return { batchId, poolItemId: null, status: "queued" as const };
  }

  async getVoicePreview(id: string): Promise<TopLevelBinaryResponse> {
    const [row] = await this.database
      .select({
        contentType: minimaxVoicePreview.contentType,
        storageKey: minimaxVoicePreview.storageKey,
      })
      .from(minimaxVoicePreview)
      .where(eq(minimaxVoicePreview.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Voice preview not found", {
        errorCode: "VOICE_PREVIEW_NOT_FOUND",
      });
    }
    return this.getObjectResponse(row.storageKey, {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: row.contentType,
    });
  }

  async getAiInterviewInvitation(token: string) {
    const payload = parseSignedToken(token);
    if (!payload || !("kind" in payload)) {
      throw new NotFoundException("AI interview invitation not found", {
        errorCode: "AI_INTERVIEW_INVITATION_NOT_FOUND",
      });
    }
    const [row] = await this.database
      .select({
        candidateName: studioInterview.candidateName,
        companyName: globalConfig.companyName,
        expiresAt: studioInterviewSchedule.candidateInviteExpiresAt,
        jobName: studioInterview.targetRole,
        roundName: studioInterviewSchedule.roundLabel,
        scheduledAt: studioInterviewSchedule.scheduledAt,
        status: studioInterviewSchedule.candidateInviteStatus,
        tokenHash: studioInterviewSchedule.candidateInviteTokenHash,
        workspaceName: organization.name,
      })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .innerJoin(organization, eq(organization.id, studioInterviewSchedule.organizationId))
      .leftJoin(
        globalConfig,
        eq(globalConfig.organizationId, studioInterviewSchedule.organizationId),
      )
      .where(eq(studioInterviewSchedule.id, payload.scheduleEntryId))
      .limit(1);
    if (!row?.expiresAt || row.tokenHash !== tokenHash(token)) {
      throw new NotFoundException("AI interview invitation not found", {
        errorCode: "AI_INTERVIEW_INVITATION_NOT_FOUND",
      });
    }
    return {
      candidateName: row.candidateName,
      companyName: row.companyName?.trim() || row.workspaceName,
      expiresAt: row.expiresAt.toISOString(),
      jobName: row.jobName,
      roundName: row.roundName,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      status: row.expiresAt <= new Date() ? "expired" : row.status,
    };
  }

  async respondAiInterviewInvitation(input: {
    body: z.infer<typeof invitationResponseSchema>;
    token: string;
  }) {
    const payload = parseSignedToken(input.token);
    if (!payload || !("kind" in payload)) {
      throw new NotFoundException("Interview invitation link is invalid", {
        errorCode: "AI_INTERVIEW_INVITATION_INVALID",
      });
    }
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          candidateName: studioInterview.candidateName,
          companyName: globalConfig.companyName,
          createdBy: studioInterviewSchedule.createdBy,
          expiresAt: studioInterviewSchedule.candidateInviteExpiresAt,
          initiatorEmail: user.email,
          initiatorName: user.name,
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
          invitationVersion: studioInterviewSchedule.invitationVersion,
          jobName: studioInterview.targetRole,
          organizationId: studioInterviewSchedule.organizationId,
          roundLabel: studioInterviewSchedule.roundLabel,
          scheduledAt: studioInterviewSchedule.scheduledAt,
          status: studioInterviewSchedule.candidateInviteStatus,
          tokenHash: studioInterviewSchedule.candidateInviteTokenHash,
          workspaceName: organization.name,
        })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .innerJoin(organization, eq(organization.id, studioInterviewSchedule.organizationId))
        .leftJoin(
          globalConfig,
          eq(globalConfig.organizationId, studioInterviewSchedule.organizationId),
        )
        .leftJoin(user, eq(user.id, studioInterviewSchedule.createdBy))
        .where(eq(studioInterviewSchedule.id, payload.scheduleEntryId))
        .limit(1)
        .for("update");
      if (
        !row ||
        !row.expiresAt ||
        row.expiresAt <= new Date() ||
        row.tokenHash !== tokenHash(input.token) ||
        row.status === "expired"
      ) {
        throw new GoneException("Interview invitation has expired", {
          errorCode: "AI_INTERVIEW_INVITATION_EXPIRED",
        });
      }
      const nextStatus = input.body.action === "accept" ? "accepted" : "declined";
      if (["accepted", "declined"].includes(row.status) && row.status !== nextStatus) {
        throw new ConflictException("Interview invitation response cannot be changed", {
          errorCode: "AI_INTERVIEW_INVITATION_RESPONSE_CONFLICT",
        });
      }
      if (row.status !== nextStatus) {
        const respondedAt = new Date();
        await transaction
          .update(studioInterviewSchedule)
          .set({
            candidateDeclineReason:
              nextStatus === "declined" ? input.body.declineReason?.trim() || null : null,
            candidateInviteStatus: nextStatus,
            candidateRespondedAt: respondedAt,
            updatedAt: respondedAt,
          })
          .where(
            and(
              eq(studioInterviewSchedule.id, payload.scheduleEntryId),
              eq(studioInterviewSchedule.invitationVersion, row.invitationVersion),
            ),
          );
        if (notificationFlowEnabled()) {
          const type =
            nextStatus === "accepted" ? "ai_invitation_accepted" : "ai_invitation_declined";
          await enqueuePreparedNotificationEvent(transaction, {
            actorUserId: null,
            dedupeKey: buildInterviewNotificationDedupeKey({
              scopeId: payload.scheduleEntryId,
              type,
              version: row.invitationVersion,
            }),
            id: crypto.randomUUID(),
            interviewRecordId: row.interviewRecordId,
            organizationId: row.organizationId,
            payloadSnapshot: {
              candidateName: row.candidateName,
              companyName: row.companyName?.trim() || row.workspaceName,
              initiatorName: row.initiatorName ?? undefined,
              interviewLink: absoluteAppUrl(
                buildInterviewLink(row.interviewRecordId, payload.scheduleEntryId),
              ),
              interviewStartTime: row.scheduledAt?.toISOString(),
              interviewType: "ai",
              jobName: row.jobName ?? undefined,
              responseTime: respondedAt.toISOString(),
              roundName: row.roundLabel,
              schemaVersion: 1,
              supportContact: row.initiatorEmail ?? undefined,
              timeZone: "Asia/Shanghai",
            },
            scheduleEntryId: payload.scheduleEntryId,
            scopeType: "ai_round",
            type,
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
  }

  async getCandidateMeeting(inviteToken: string) {
    const scope = await this.resolveCandidateMeeting(inviteToken);
    if (!scope) {
      const expired = await this.isCurrentHumanInvitationToken(inviteToken);
      if (expired) {
        await this.recordHumanInvitationException(inviteToken, "invitation_expired").catch(
          () => false,
        );
        throw new GoneException("Human interview invitation has expired", {
          errorCode: "HUMAN_INTERVIEW_INVITATION_EXPIRED",
        });
      }
      throw new NotFoundException("Human interview invitation is unavailable", {
        errorCode: "HUMAN_INTERVIEW_INVITATION_NOT_FOUND",
      });
    }
    return {
      candidateInviteStatus: scope.candidateInviteStatus,
      candidateName: scope.candidateName,
      meetingId: scope.meetingId,
      roundLabel: scope.roundLabel,
      scheduledAt: scope.scheduledAt?.toISOString() ?? null,
      status: scope.status,
      title: scope.title,
      validUntil: scope.validUntil?.toISOString() ?? null,
    };
  }

  async getInterviewerMeeting(inviteToken: string) {
    const scope = await this.requireInterviewerMeeting(inviteToken);
    return this.publicInterviewerScope(scope);
  }

  async respondCandidateMeetingInvitation(input: {
    body: z.infer<typeof invitationResponseSchema>;
    inviteToken: string;
  }) {
    const payload = parseSignedToken(input.inviteToken);
    if (!payload || !("roundId" in payload)) {
      throw new NotFoundException("Human interview invitation is invalid", {
        errorCode: "HUMAN_INTERVIEW_INVITATION_INVALID",
      });
    }
    try {
      return await this.database.transaction(async (transaction) => {
        const [row] = await transaction
          .select({
            expiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
            interviewRecordId: studioHumanInterviewRound.interviewRecordId,
            invitationVersion: studioHumanInterviewMeetingRound.invitationVersion,
            meetingStatus: studioHumanInterviewMeeting.status,
            organizationId: studioHumanInterviewMeeting.organizationId,
            roundLabel: studioHumanInterviewRound.label,
            scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
            status: studioHumanInterviewMeetingRound.candidateInviteStatus,
            tokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
          })
          .from(studioHumanInterviewMeetingRound)
          .innerJoin(
            studioHumanInterviewMeeting,
            eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
          )
          .innerJoin(
            studioHumanInterviewRound,
            eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
          )
          .where(
            and(
              eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
              eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
            ),
          )
          .limit(1)
          .for("update");
        if (
          !row ||
          !row.expiresAt ||
          row.expiresAt <= new Date() ||
          payload.exp < Date.now() ||
          row.tokenHash !== tokenHash(input.inviteToken)
        ) {
          throw new GoneException("Human interview invitation has expired", {
            errorCode: "HUMAN_INTERVIEW_INVITATION_EXPIRED",
          });
        }
        const nextStatus = input.body.action === "accept" ? "accepted" : "declined";
        if (["cancelled", "ended"].includes(row.meetingStatus)) {
          throw new ConflictException("Human interview has ended or was cancelled", {
            errorCode: "HUMAN_INTERVIEW_ENDED",
          });
        }
        if (["accepted", "declined"].includes(row.status) && row.status !== nextStatus) {
          throw new ConflictException("Human interview response cannot be changed", {
            errorCode: "HUMAN_INTERVIEW_INVITATION_RESPONSE_CONFLICT",
          });
        }
        if (row.status !== nextStatus) {
          const respondedAt = new Date();
          await transaction
            .update(studioHumanInterviewMeetingRound)
            .set({
              candidateDeclineReason:
                nextStatus === "declined" ? input.body.declineReason?.trim() || null : null,
              candidateInviteStatus: nextStatus,
              candidateRespondedAt: respondedAt,
            })
            .where(
              and(
                eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
                eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
                eq(studioHumanInterviewMeetingRound.invitationVersion, row.invitationVersion),
              ),
            );
          if (notificationFlowEnabled()) {
            const type =
              nextStatus === "accepted" ? "human_invitation_accepted" : "human_invitation_declined";
            await enqueuePreparedNotificationEvent(transaction, {
              actorUserId: null,
              dedupeKey: buildInterviewNotificationDedupeKey({
                discriminator: `candidate-response:${row.invitationVersion}`,
                scopeId: payload.meetingId,
                type,
                version: row.scheduleVersion,
              }),
              humanMeetingId: payload.meetingId,
              humanRoundId: payload.roundId,
              id: crypto.randomUUID(),
              interviewRecordId: row.interviewRecordId,
              organizationId: row.organizationId,
              payloadSnapshot: {
                interviewType: "human",
                responseTime: respondedAt.toISOString(),
                roundName: row.roundLabel,
                schemaVersion: 1,
                timeZone: "Asia/Shanghai",
              },
              scopeType: "human_meeting",
              type,
            });
            if (nextStatus === "accepted") {
              const activeRounds = await transaction
                .select({ status: studioHumanInterviewMeetingRound.candidateInviteStatus })
                .from(studioHumanInterviewMeetingRound)
                .innerJoin(
                  studioHumanInterviewRound,
                  eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
                )
                .where(
                  and(
                    eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
                    ne(studioHumanInterviewRound.status, "cancelled"),
                  ),
                );
              if (
                activeRounds.length > 0 &&
                activeRounds.every((round) => round.status === "accepted")
              ) {
                await enqueuePreparedNotificationEvent(transaction, {
                  actorUserId: null,
                  dedupeKey: buildInterviewNotificationDedupeKey({
                    scopeId: payload.meetingId,
                    type: "human_interview_confirmed",
                    version: row.scheduleVersion,
                  }),
                  humanMeetingId: payload.meetingId,
                  id: crypto.randomUUID(),
                  interviewRecordId: row.interviewRecordId,
                  organizationId: row.organizationId,
                  payloadSnapshot: {
                    interviewType: "human",
                    roundName: row.roundLabel,
                    schemaVersion: 1,
                    timeZone: "Asia/Shanghai",
                  },
                  scopeType: "human_meeting",
                  type: "human_interview_confirmed",
                });
              }
            }
          }
        }
        return { status: nextStatus };
      });
    } catch (error) {
      const type =
        error instanceof GoneException
          ? "invitation_expired"
          : error instanceof ConflictException
            ? "response_conflict"
            : "system_error";
      await this.recordHumanInvitationException(input.inviteToken, type).catch(() => false);
      throw error;
    }
  }

  async createCandidateMeetingLiveKitToken(inviteToken: string) {
    const scope = await this.requireCandidateMeeting(inviteToken);
    if (scope.candidateInviteStatus !== "accepted") {
      throw new ForbiddenException("Accept the interview invitation before joining", {
        errorCode: "HUMAN_INTERVIEW_INVITATION_NOT_ACCEPTED",
      });
    }
    this.assertMeetingJoinable(scope);
    return this.signHumanMeetingToken({
      canPublish: true,
      identity: `candidate_${scope.roundId}`,
      metadata: {
        human_interview_meeting_id: scope.meetingId,
        interview_record_id: scope.interviewRecordId,
        participant_role: "candidate",
        participant_type: "candidate",
        round_id: scope.roundId,
      },
      name: scope.candidateName,
      role: "candidate",
      roomName: scope.liveKitRoomName,
    });
  }

  async createInterviewerMeetingLiveKitToken(inviteToken: string) {
    const scope = await this.requireInterviewerMeeting(inviteToken);
    this.assertMeetingJoinable(scope);
    return this.signHumanMeetingToken({
      canPublish: scope.role !== "observer",
      identity: `interviewer_${scope.userId}`,
      metadata: {
        human_interview_meeting_id: scope.meetingId,
        participant_role: scope.role,
        participant_type: "interviewer",
        user_id: scope.userId,
      },
      name: scope.interviewerName,
      role: scope.role,
      roomName: scope.liveKitRoomName,
    });
  }

  async endInterviewerMeeting(inviteToken: string) {
    const scope = await this.requireInterviewerMeeting(inviteToken);
    const now = new Date();
    await this.database
      .update(studioHumanInterviewMeeting)
      .set({
        endedAt: now,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "ended",
        updatedAt: now,
      })
      .where(eq(studioHumanInterviewMeeting.id, scope.meetingId));
    if (scope.liveKitRoomName) {
      try {
        await this.roomService().deleteRoom(scope.liveKitRoomName);
      } catch {
        // Meeting state is canonical; room cleanup is best effort.
      }
    }
    return { ok: true as const };
  }

  async resolveRound(id: string) {
    const scope = await this.requireRoundScope(id);
    return { roundId: scope.roundId };
  }

  async getRound(id: string) {
    const scope = await this.requireRoundScope(id);
    const [[round], [candidate], [report]] = await Promise.all([
      this.database
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, scope.roundId))
        .limit(1),
      this.database
        .select({
          candidateEmail: studioInterview.candidateEmail,
          candidateName: studioInterview.candidateName,
          candidatePhone: studioInterview.candidatePhone,
          createdAt: studioInterview.createdAt,
          createdBy: studioInterview.createdBy,
          creatorName: candidateCreator.name,
          creatorOrganizationName: candidateCreator.feishuTenantName,
          id: studioInterview.id,
          interviewQuestions: studioInterview.interviewQuestions,
          jobDescriptionId: studioInterview.jobDescriptionId,
          jobDescriptionName: jobDescription.name,
          notes: studioInterview.notes,
          outcome: studioInterview.outcome,
          pipelineStage: studioInterview.pipelineStage,
          resumeContentHash: studioInterview.resumeContentHash,
          resumeFileName: studioInterview.resumeFileName,
          resumeProfile: studioInterview.resumeProfile,
          resumeStorageKey: studioInterview.resumeStorageKey,
          targetRole: studioInterview.targetRole,
          updatedAt: studioInterview.updatedAt,
        })
        .from(studioInterview)
        .leftJoin(candidateCreator, eq(studioInterview.createdBy, candidateCreator.id))
        .leftJoin(
          jobDescription,
          and(
            eq(studioInterview.jobDescriptionId, jobDescription.id),
            eq(jobDescription.organizationId, studioInterview.organizationId),
          ),
        )
        .where(
          and(
            eq(studioInterview.id, scope.candidateId),
            eq(studioInterview.organizationId, scope.organizationId),
          ),
        )
        .limit(1),
      this.database
        .select({ id: interviewConversation.conversationId })
        .from(interviewConversation)
        .where(eq(interviewConversation.scheduleEntryId, scope.roundId))
        .limit(1),
    ]);
    if (!round || !candidate) {
      throw new NotFoundException("Interview round not found", {
        errorCode: "PUBLIC_INTERVIEW_ROUND_NOT_FOUND",
      });
    }
    const [publishedJob] = candidate.jobDescriptionId
      ? await this.database
          .select({ policy: jobDescription.resumeScreeningPolicy })
          .from(jobDescription)
          .where(
            and(
              eq(jobDescription.id, candidate.jobDescriptionId),
              eq(jobDescription.organizationId, scope.organizationId),
              eq(jobDescription.lifecycleStatus, "published"),
            ),
          )
          .limit(1)
      : [];
    return jsonSafe({
      allowTextInput: round.allowTextInput,
      candidate: { ...candidate, interviewQuestions: candidate.interviewQuestions ?? [] },
      candidateFeedback: null,
      candidateInviteExpiresAt: round.candidateInviteExpiresAt,
      conversationId: round.conversationId,
      createdAt: round.createdAt,
      disconnectedAt: round.disconnectedAt,
      hasReport: Boolean(report),
      id: round.id,
      interviewLink: buildInterviewLink(scope.candidateId, scope.roundId),
      jdRequiredSkills: deriveJdRequiredSkills(publishedJob?.policy ?? null),
      notes: round.notes,
      roundLabel: round.roundLabel,
      scheduledAt: round.scheduledAt,
      scheduledEndAt: round.scheduledEndAt,
      sessionStartedAt: round.sessionStartedAt,
      sortOrder: round.sortOrder,
      status: round.status,
      updatedAt: round.updatedAt,
    });
  }

  async getRoundReports(id: string) {
    const scope = await this.requireRoundScope(id);
    const rows = await this.database
      .select()
      .from(interviewConversation)
      .where(eq(interviewConversation.scheduleEntryId, scope.roundId))
      .orderBy(desc(interviewConversation.updatedAt));
    return jsonSafe(await this.hydrateReports(rows));
  }

  async getRoundReport(input: { conversationId: string; id: string }) {
    const scope = await this.requireRoundScope(input.id);
    const [row] = await this.database
      .select()
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.conversationId, input.conversationId),
          eq(interviewConversation.scheduleEntryId, scope.roundId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException("Interview report not found", {
        errorCode: "PUBLIC_INTERVIEW_REPORT_NOT_FOUND",
      });
    }
    return jsonSafe((await this.hydrateReports([row]))[0]);
  }

  async getRoundFormSubmissions(id: string) {
    const scope = await this.requireRoundScope(id);
    const rows = await this.database
      .select()
      .from(candidateFormSubmission)
      .where(eq(candidateFormSubmission.interviewRecordId, scope.candidateId))
      .orderBy(asc(candidateFormSubmission.submittedAt));
    return { submissions: jsonSafe(rows) };
  }

  async getRoundRecording(input: { conversationId: string; id: string }) {
    const scope = await this.requireRoundScope(input.id);
    const [row] = await this.database
      .select({
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.conversationId, input.conversationId),
          eq(interviewConversation.scheduleEntryId, scope.roundId),
        ),
      )
      .limit(1);
    if (!row?.recordingFileKey) {
      throw new NotFoundException("Interview recording not found", {
        errorCode: "PUBLIC_INTERVIEW_RECORDING_NOT_FOUND",
      });
    }
    if (row.recordingStatus !== "completed") {
      throw new ConflictException("Interview recording is not ready", {
        cause: { status: row.recordingStatus ?? "unknown" },
        errorCode: "PUBLIC_INTERVIEW_RECORDING_NOT_READY",
      });
    }
    const storage = this.getStorage();
    return {
      expiresInSeconds: 600,
      url: await getSignedUrl(
        storage.client,
        new GetObjectCommand({ Bucket: storage.bucket, Key: row.recordingFileKey }),
        { expiresIn: 600 },
      ),
    };
  }

  async getRoundResume(id: string) {
    const scope = await this.requireRoundScope(id);
    return this.getCandidateResumeObject(scope.candidateId, "private, max-age=300");
  }

  async getRoundResumePreview(id: string) {
    const scope = await this.requireRoundScope(id);
    return this.getCandidateResumeObject(scope.candidateId, "private, max-age=300", true);
  }

  async getResume(id: string) {
    const [row] = await this.database
      .select({
        candidate: studioInterview,
        creatorImage: candidateCreator.image,
        creatorName: candidateCreator.name,
        creatorOrganizationName: candidateCreator.feishuTenantName,
        jobDescriptionDepartmentName: department.name,
        jobDescriptionEvaluationMode: jobDescription.evaluationMode,
        jobDescriptionName: jobDescription.name,
        jobDescriptionResumeScreeningPolicyHash: jobDescription.resumeScreeningPolicyHash,
      })
      .from(studioInterview)
      .leftJoin(candidateCreator, eq(studioInterview.createdBy, candidateCreator.id))
      .leftJoin(
        jobDescription,
        and(
          eq(studioInterview.jobDescriptionId, jobDescription.id),
          eq(jobDescription.organizationId, studioInterview.organizationId),
        ),
      )
      .leftJoin(
        department,
        and(
          eq(jobDescription.departmentId, department.id),
          eq(department.organizationId, studioInterview.organizationId),
        ),
      )
      .where(eq(studioInterview.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Resume not found", { errorCode: "PUBLIC_RESUME_NOT_FOUND" });
    }
    const [[roundCount], [lastInterview], [latestDocument], aiRounds, humanRounds, offerDrafts] =
      await Promise.all([
        this.database
          .select({ total: count() })
          .from(studioInterviewSchedule)
          .where(eq(studioInterviewSchedule.interviewRecordId, id)),
        this.database
          .select({
            value: sql<Date | null>`MAX(COALESCE(${interviewConversation.startedAt}, ${interviewConversation.createdAt}))`,
          })
          .from(interviewConversation)
          .where(
            and(
              eq(interviewConversation.interviewRecordId, id),
              inArray(interviewConversation.status, ["completed", "done"]),
            ),
          ),
        this.database
          .select({ url: interviewNotification.feishuDocumentUrl })
          .from(interviewNotification)
          .where(
            and(
              eq(interviewNotification.interviewRecordId, id),
              eq(interviewNotification.type, "summary_ready"),
              isNotNull(interviewNotification.feishuDocumentUrl),
            ),
          )
          .orderBy(desc(interviewNotification.updatedAt))
          .limit(1),
        this.database
          .select({
            roundLabel: studioInterviewSchedule.roundLabel,
            sortOrder: studioInterviewSchedule.sortOrder,
            status: studioInterviewSchedule.status,
          })
          .from(studioInterviewSchedule)
          .where(eq(studioInterviewSchedule.interviewRecordId, id))
          .orderBy(asc(studioInterviewSchedule.sortOrder)),
        this.database
          .select({
            feedback: studioHumanInterviewRound.feedback,
            id: studioHumanInterviewRound.id,
            label: studioHumanInterviewRound.label,
            outcome: studioHumanInterviewRound.outcome,
            scheduledAt: studioHumanInterviewRound.scheduledAt,
            sortOrder: studioHumanInterviewRound.sortOrder,
            status: studioHumanInterviewRound.status,
          })
          .from(studioHumanInterviewRound)
          .where(eq(studioHumanInterviewRound.interviewRecordId, id))
          .orderBy(asc(studioHumanInterviewRound.sortOrder)),
        this.database
          .select({
            id: studioOfferDraft.id,
            responseAt: studioOfferDraft.responseAt,
            sentAt: studioOfferDraft.sentAt,
            status: studioOfferDraft.status,
            version: studioOfferDraft.version,
          })
          .from(studioOfferDraft)
          .where(eq(studioOfferDraft.interviewRecordId, id))
          .orderBy(asc(studioOfferDraft.version)),
      ]);
    const countedHumanRounds = humanRounds.filter((round) => round.status !== "cancelled");
    const activeAiRound = aiRounds.find((round) => round.status !== "completed") ?? null;
    const activeHumanRound = humanRounds.find((round) => round.status === "pending") ?? null;
    const activeOfferDrafts = offerDrafts.filter((draft) => draft.status !== "superseded");
    const latestOffer = activeOfferDrafts.toSorted(
      (left, right) => right.version - left.version,
    )[0];
    const stageProgress = {
      aiInterview:
        aiRounds.length === 0
          ? null
          : {
              activeRound: activeAiRound
                ? {
                    roundLabel: activeAiRound.roundLabel,
                    sortOrder: activeAiRound.sortOrder,
                    status: activeAiRound.status,
                  }
                : null,
              completedRounds: aiRounds.filter((round) => round.status === "completed").length,
              hasStarted: aiRounds.some((round) => round.status !== "pending"),
              totalRounds: aiRounds.length,
            },
      humanInterview:
        countedHumanRounds.length === 0
          ? null
          : {
              activeRound: activeHumanRound
                ? {
                    id: activeHumanRound.id,
                    label: activeHumanRound.label,
                    outcome: activeHumanRound.outcome,
                    scheduledAt: serializeTimestamp(activeHumanRound.scheduledAt),
                    sortOrder: activeHumanRound.sortOrder,
                    status: activeHumanRound.status,
                  }
                : null,
              completedRounds: countedHumanRounds.filter((round) => round.status === "completed")
                .length,
              completedRoundsMissingFeedback: countedHumanRounds.filter(
                (round) => round.status === "completed" && !round.feedback?.trim(),
              ).length,
              failedRounds: countedHumanRounds.filter(
                (round) => round.status === "completed" && round.outcome === "fail",
              ).length,
              passedRounds: countedHumanRounds.filter(
                (round) => round.status === "completed" && round.outcome === "pass",
              ).length,
              totalRounds: countedHumanRounds.length,
            },
      offer:
        activeOfferDrafts.length === 0
          ? null
          : {
              latestDraft: latestOffer
                ? {
                    id: latestOffer.id,
                    responseAt: serializeTimestamp(latestOffer.responseAt),
                    sentAt: serializeTimestamp(latestOffer.sentAt),
                    status: latestOffer.status,
                    version: latestOffer.version,
                  }
                : null,
              totalVersions: activeOfferDrafts.length,
            },
    };
    const { candidate } = row;
    const profile = resumeProfileSchema.safeParse(candidate.resumeProfile);
    const review = resumeReviewProjectionSchema.safeParse(candidate.resumeReview);
    const reviewValue = review.success ? review.data : null;
    const rawReviewScore = reviewValue?.overall?.baseScore ?? reviewValue?.overall?.score;
    const numericReviewScore =
      rawReviewScore === undefined || rawReviewScore === "" ? null : Number(rawReviewScore);
    const nextStepAction = resumeReviewActionSchema.safeParse(reviewValue?.nextStep?.action);
    const screening = resumeScreeningResultSchema.safeParse(candidate.resumeScreeningResult);
    const qualitative = qualitativeResumeEvaluationSchema.safeParse(
      candidate.qualitativeResumeEvaluation,
    );
    const structured = structuredResumeEvaluationV1Schema.safeParse(
      candidate.structuredResumeEvaluation,
    );
    const resumeSkills = [
      ...new Map(
        (profile.success ? profile.data.skills : [])
          .map((skill) => skill.trim())
          .filter(Boolean)
          .map((skill) => [skill.toLocaleLowerCase(), skill]),
      ).values(),
    ].slice(0, 6);
    const resumeSummary =
      (qualitative.success ? qualitative.data.conciseOverall : null) ??
      (structured.success
        ? (structured.data.narrative.overallComment ?? structured.data.narrative.summary)
        : null) ??
      reviewValue?.overall?.conclusion ??
      candidate.notes?.trim() ??
      null;
    const duplicateMatch = await this.loadDuplicateSummary(candidate.id, candidate.organizationId);
    return jsonSafe({
      candidateEmail: candidate.candidateEmail,
      candidateExpectationsMeta: candidate.candidateExpectationsMeta,
      candidateName: candidate.candidateName,
      candidatePhone: candidate.candidatePhone,
      closedAt: candidate.closedAt,
      closedMeta: candidate.closedMeta,
      closedReason: candidate.closedReason,
      createdAt: candidate.createdAt,
      createdBy: candidate.createdBy,
      creatorImage: row.creatorImage,
      creatorName: row.creatorName,
      creatorOrganizationName: row.creatorOrganizationName,
      duplicateMatch,
      feishuDocumentUrl: latestDocument?.url ?? null,
      hasInterviewRounds: (roundCount?.total ?? 0) > 0,
      hasResumeFile: Boolean(candidate.resumeStorageKey),
      hrResumeAssessment: candidate.hrResumeAssessment,
      hrResumeAssessmentUpdatedAt: candidate.hrResumeAssessmentUpdatedAt,
      hrResumeAssessmentUpdatedBy: candidate.hrResumeAssessmentUpdatedBy,
      humanInterviewScheduledAt: candidate.humanInterviewScheduledAt,
      humanInterviewerId: candidate.humanInterviewerId,
      id: candidate.id,
      interviewQuestions: candidate.interviewQuestions ?? [],
      jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
      jobDescriptionId: candidate.jobDescriptionId,
      jobDescriptionName: row.jobDescriptionName,
      jobEvaluationMode: row.jobDescriptionEvaluationMode,
      lastInterviewAt: lastInterview?.value?.toISOString() ?? null,
      notes: candidate.notes,
      offerAcceptedAt: candidate.offerAcceptedAt,
      offerSentAt: candidate.offerSentAt,
      outcome: candidate.outcome,
      pipelineStage: candidate.pipelineStage,
      qualitativeJobDescriptionVersionId: candidate.qualitativeJobDescriptionVersionId,
      qualitativeRecommendationLevel: candidate.qualitativeRecommendationLevel,
      qualitativeResumeEvaluation: qualitative.success ? qualitative.data : null,
      qualitativeResumeSummary: qualitative.success ? qualitative.data.conciseOverall : null,
      resumeContentHash: candidate.resumeContentHash,
      resumeEvaluationArtifactMode:
        candidate.resumeEvaluationArtifactMode ??
        (candidate.structuredCompositeScore === null
          ? numericReviewScore !== null
            ? "legacy"
            : null
          : "structured"),
      resumeEvaluationAttemptMode: candidate.resumeEvaluationAttemptMode,
      resumeEvaluationStatus: candidate.resumeEvaluationStatus,
      resumeFileName: candidate.resumeFileName,
      resumeParseError: candidate.resumeParseError,
      resumeParseRetryable:
        candidate.resumeParseStatus === "failed" && Boolean(candidate.resumeStorageKey),
      resumeParseStatus: candidate.resumeParseStatus,
      resumeParsedAt: candidate.resumeParsedAt,
      resumeProfile: profile.success ? profile.data : null,
      resumeProfileSnapshot: compactResumeProfileSnapshot(candidate.resumeProfile),
      resumeReview: candidate.resumeReview,
      resumeReviewBaseScore:
        numericReviewScore !== null && Number.isFinite(numericReviewScore)
          ? Math.round(numericReviewScore)
          : null,
      resumeReviewError: candidate.resumeReviewError,
      resumeReviewGeneratedAt: candidate.resumeReviewGeneratedAt,
      resumeReviewNextStepAction: nextStepAction.success ? nextStepAction.data : null,
      resumeReviewQueuedAt: candidate.resumeReviewQueuedAt,
      resumeReviewRunId: candidate.resumeReviewRunId,
      resumeReviewStatus: candidate.resumeReviewStatus,
      resumeScreeningError: candidate.resumeScreeningError,
      resumeScreeningEvaluatedAt: candidate.resumeScreeningEvaluatedAt,
      resumeScreeningResult: screening.success ? screening.data : null,
      resumeScreeningStale: Boolean(
        screening.success &&
        screening.data.policyHash &&
        row.jobDescriptionResumeScreeningPolicyHash &&
        screening.data.policyHash !== row.jobDescriptionResumeScreeningPolicyHash,
      ),
      resumeScreeningStatus: candidate.resumeScreeningStatus,
      resumeSkills,
      resumeSummary,
      stageProgress,
      structuredCompositeScore: candidate.structuredCompositeScore,
      structuredGateSortRank: candidate.structuredGateSortRank,
      structuredGateStatus: candidate.structuredGateStatus,
      structuredResumeEvaluation: structured.success ? structured.data : null,
      structuredScoreGrade: candidate.structuredScoreGrade,
      targetRole: candidate.targetRole,
      updatedAt: candidate.updatedAt,
      writtenTestScheduledAt: candidate.writtenTestScheduledAt,
      writtenTestScore: candidate.writtenTestScore,
    });
  }

  async listResumeRounds(id: string) {
    const [candidate] = await this.database
      .select({ id: studioInterview.id, organizationId: studioInterview.organizationId })
      .from(studioInterview)
      .where(eq(studioInterview.id, id))
      .limit(1);
    if (!candidate) {
      throw new NotFoundException("Resume not found", { errorCode: "PUBLIC_RESUME_NOT_FOUND" });
    }
    const rows = await this.database
      .select({
        allowTextInput: studioInterviewSchedule.allowTextInput,
        candidateEmail: studioInterview.candidateEmail,
        candidateId: studioInterview.id,
        candidateInviteExpiresAt: studioInterviewSchedule.candidateInviteExpiresAt,
        candidateName: studioInterview.candidateName,
        candidatePhone: studioInterview.candidatePhone,
        conversationId: studioInterviewSchedule.conversationId,
        createdAt: studioInterviewSchedule.createdAt,
        createdBy: studioInterviewSchedule.createdBy,
        creatorImage: user.image,
        creatorName: user.name,
        creatorOrganizationName: user.feishuTenantName,
        id: studioInterviewSchedule.id,
        jobDescriptionDepartmentName: department.name,
        jobDescriptionId: studioInterview.jobDescriptionId,
        jobDescriptionName: jobDescription.name,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
        roundLabel: studioInterviewSchedule.roundLabel,
        scheduledAt: studioInterviewSchedule.scheduledAt,
        scheduledEndAt: studioInterviewSchedule.scheduledEndAt,
        sortOrder: studioInterviewSchedule.sortOrder,
        status: studioInterviewSchedule.status,
        targetRole: studioInterview.targetRole,
        updatedAt: studioInterviewSchedule.updatedAt,
      })
      .from(studioInterviewSchedule)
      .leftJoin(studioInterview, eq(studioInterviewSchedule.interviewRecordId, studioInterview.id))
      .leftJoin(
        jobDescription,
        and(
          eq(studioInterview.jobDescriptionId, jobDescription.id),
          eq(jobDescription.organizationId, studioInterview.organizationId),
        ),
      )
      .leftJoin(
        department,
        and(
          eq(jobDescription.departmentId, department.id),
          eq(department.organizationId, studioInterview.organizationId),
        ),
      )
      .leftJoin(user, eq(studioInterviewSchedule.createdBy, user.id))
      .where(eq(studioInterviewSchedule.interviewRecordId, id))
      .orderBy(asc(studioInterviewSchedule.sortOrder));
    const roundIds = rows.map((row) => row.id);
    const derivedRows =
      roundIds.length === 0
        ? []
        : await this.database
            .select({
              lastInterviewAt: sql<Date | null>`MAX(COALESCE(${interviewConversation.startedAt}, ${interviewConversation.createdAt}))`,
              reportCount: count(),
              roundId: interviewConversation.scheduleEntryId,
            })
            .from(interviewConversation)
            .where(inArray(interviewConversation.scheduleEntryId, roundIds))
            .groupBy(interviewConversation.scheduleEntryId);
    const latestConversations =
      roundIds.length === 0
        ? []
        : await this.database
            .select({
              conversationId: interviewConversation.conversationId,
              dataCollectionResults: interviewConversation.dataCollectionResults,
              roundId: interviewConversation.scheduleEntryId,
            })
            .from(interviewConversation)
            .where(
              and(
                eq(interviewConversation.organizationId, candidate.organizationId),
                inArray(interviewConversation.scheduleEntryId, roundIds),
                isNotNull(interviewConversation.endedAt),
              ),
            )
            .orderBy(
              asc(interviewConversation.scheduleEntryId),
              desc(interviewConversation.endedAt),
              desc(interviewConversation.updatedAt),
            );
    const conversationByRound = new Map<string, (typeof latestConversations)[number]>();
    for (const conversation of latestConversations) {
      if (conversation.roundId && !conversationByRound.has(conversation.roundId)) {
        conversationByRound.set(conversation.roundId, conversation);
      }
    }
    const conversationIds = [...conversationByRound.values()].map(
      (conversation) => conversation.conversationId,
    );
    const documents =
      conversationIds.length === 0
        ? []
        : await this.database
            .select({
              conversationId: interviewNotification.conversationId,
              url: interviewNotification.feishuDocumentUrl,
            })
            .from(interviewNotification)
            .where(
              and(
                eq(interviewNotification.organizationId, candidate.organizationId),
                inArray(interviewNotification.conversationId, conversationIds),
                eq(interviewNotification.type, "summary_ready"),
                isNotNull(interviewNotification.feishuDocumentUrl),
              ),
            )
            .orderBy(desc(interviewNotification.updatedAt));
    const documentsByConversation = new Map<string, string>();
    for (const document of documents) {
      if (
        document.conversationId &&
        document.url &&
        !documentsByConversation.has(document.conversationId)
      ) {
        documentsByConversation.set(document.conversationId, document.url);
      }
    }
    const derivedByRound = new Map(derivedRows.map((row) => [row.roundId, row]));
    return jsonSafe(
      rows.map((row) => ({
        allowTextInput: row.allowTextInput,
        candidateEmail: row.candidateEmail,
        candidateId: row.candidateId ?? id,
        candidateInviteExpiresAt: row.candidateInviteExpiresAt,
        candidateName: row.candidateName ?? "",
        candidatePhone: row.candidatePhone,
        conversationId: row.conversationId,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        creatorImage: row.creatorImage,
        creatorName: row.creatorName,
        creatorOrganizationName: row.creatorOrganizationName,
        feishuDocumentUrl: conversationByRound.get(row.id)
          ? (documentsByConversation.get(conversationByRound.get(row.id)!.conversationId) ?? null)
          : null,
        feishuEvaluationDocumentStatus: (() => {
          const conversation = conversationByRound.get(row.id);
          if (!conversation) {
            return "unavailable";
          }
          if (documentsByConversation.has(conversation.conversationId)) {
            return "generated";
          }
          return hasExistingInterviewAnswers(conversation.dataCollectionResults)
            ? "answers_available"
            : "unavailable";
        })(),
        hasReport: (derivedByRound.get(row.id)?.reportCount ?? 0) > 0,
        hasResumeFile: Boolean(row.resumeStorageKey),
        id: row.id,
        interviewLink: buildInterviewLink(id, row.id),
        jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
        jobDescriptionId: row.jobDescriptionId,
        jobDescriptionName: row.jobDescriptionName,
        lastInterviewAt: derivedByRound.get(row.id)?.lastInterviewAt?.toISOString() ?? null,
        outcome: row.outcome ?? "in_pipeline",
        pipelineStage: row.pipelineStage ?? "screening",
        resumeFileName: row.resumeFileName,
        roundLabel: row.roundLabel,
        scheduledAt: row.scheduledAt,
        scheduledEndAt: row.scheduledEndAt,
        sortOrder: row.sortOrder,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    );
  }

  async listCandidateMaterials(inviteToken: string) {
    const scope = await this.requireMaterialsScope(inviteToken);
    const rows = await this.database
      .select({
        candidateName: studioInterview.candidateName,
        id: studioInterview.id,
        roundId: studioHumanInterviewRound.id,
        roundLabel: studioHumanInterviewRound.label,
        targetRole: studioInterview.targetRole,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioInterview,
        eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id),
      )
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, scope.meetingId),
          eq(studioInterview.organizationId, scope.organizationId),
        ),
      )
      .orderBy(asc(studioHumanInterviewRound.sortOrder), asc(studioInterview.candidateName));
    const candidates = new Map<
      string,
      {
        candidateName: string;
        id: string;
        rounds: { id: string; label: string }[];
        targetRole: string;
      }
    >();
    for (const row of rows) {
      const candidate = candidates.get(row.id);
      if (candidate) {
        candidate.rounds.push({ id: row.roundId, label: row.roundLabel });
      } else {
        candidates.set(row.id, {
          candidateName: row.candidateName,
          id: row.id,
          rounds: [{ id: row.roundId, label: row.roundLabel }],
          targetRole: row.targetRole ?? "",
        });
      }
    }
    return [...candidates.values()];
  }

  async getCandidateMaterial(input: { candidateId: string; inviteToken: string }) {
    const scope = await this.requireMaterialsScope(input.inviteToken);
    const [row] = await this.materialCandidate(scope, input.candidateId);
    if (!row) {
      this.materialNotFound();
    }
    await this.recordMaterialView(scope, input.candidateId);
    const profile = resumeProfileSchema.safeParse(row.resumeProfile);
    return {
      candidate: {
        candidateEmail: row.candidateEmail,
        candidateName: row.candidateName,
        candidatePhone: row.candidatePhone,
        creatorName: row.creatorName,
        hasResumeFile: Boolean(row.resumeStorageKey),
        id: row.id,
        jobDescriptionName: row.jobDescriptionName,
        resumeFileName: row.resumeFileName,
        resumeProfile: profile.success ? profile.data : null,
        targetRole: row.targetRole,
      },
    };
  }

  async getCandidateMaterialAiEvaluation(input: { candidateId: string; inviteToken: string }) {
    const scope = await this.requireMaterialsScope(input.inviteToken);
    const [row] = await this.materialCandidate(scope, input.candidateId);
    if (!row) {
      this.materialNotFound();
    }
    const v2 = qualitativeResumeEvaluationV2Schema.safeParse(row.qualitativeResumeEvaluation);
    const v1 = qualitativeResumeEvaluationV1Schema.safeParse(row.qualitativeResumeEvaluation);
    return {
      aiEvaluation: v2.success
        ? { evaluation: v2.data, status: "ready" }
        : v1.success
          ? { evaluation: null, status: "legacy" }
          : {
              evaluation: null,
              status: ["queued", "processing"].includes(row.resumeReviewStatus)
                ? "pending"
                : row.resumeReviewStatus === "failed"
                  ? "failed"
                  : "missing",
            },
    };
  }

  async getCandidateMaterialHrInformation(input: { candidateId: string; inviteToken: string }) {
    const scope = await this.requireMaterialsScope(input.inviteToken);
    await this.assertMaterialCandidate(scope, input.candidateId);
    const rows = await this.database
      .select({
        conversationId: interviewConversation.conversationId,
        evaluationCriteriaResults: interviewConversation.evaluationCriteriaResults,
        roundLabel: studioInterviewSchedule.roundLabel,
        updatedAt: interviewConversation.updatedAt,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioInterview,
        eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id),
      )
      .innerJoin(
        interviewConversation,
        eq(interviewConversation.interviewRecordId, studioInterview.id),
      )
      .leftJoin(
        studioInterviewSchedule,
        eq(interviewConversation.scheduleEntryId, studioInterviewSchedule.id),
      )
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, scope.meetingId),
          eq(interviewConversation.interviewRecordId, input.candidateId),
          eq(interviewConversation.organizationId, scope.organizationId),
          eq(interviewConversation.summaryStatus, "ready"),
        ),
      )
      .orderBy(desc(interviewConversation.updatedAt));
    const found = rows.flatMap((row) => {
      const parsed = humanInterviewCandidateHrEvaluationSchema.safeParse(
        row.evaluationCriteriaResults.hrEvaluation,
      );
      return parsed.success ? [{ ...row, evaluation: parsed.data }] : [];
    })[0];
    return {
      hrInitialInformation: found
        ? {
            conversationId: found.conversationId,
            generatedAt: found.updatedAt.toISOString(),
            roundLabel: found.roundLabel,
            values: found.evaluation,
          }
        : null,
    };
  }

  async getCandidateMaterialQuestions(input: { candidateId: string; inviteToken: string }) {
    const scope = await this.requireMaterialsScope(input.inviteToken);
    const [row] = await this.materialCandidate(scope, input.candidateId);
    if (!row) {
      this.materialNotFound();
    }
    const parsed = z.array(studioInterviewQuestionClientSchema).safeParse(row.interviewQuestions);
    return { interviewQuestions: parsed.success ? parsed.data : [] };
  }

  async getCandidateMaterialResume(input: { candidateId: string; inviteToken: string }) {
    const scope = await this.requireMaterialsScope(input.inviteToken);
    await this.assertMaterialCandidate(scope, input.candidateId);
    return this.getCandidateResumeObject(input.candidateId, "private, max-age=300");
  }

  async getCandidateMaterialResumePreview(input: { candidateId: string; inviteToken: string }) {
    const scope = await this.requireMaterialsScope(input.inviteToken);
    await this.assertMaterialCandidate(scope, input.candidateId);
    return this.getCandidateResumeObject(input.candidateId, "private, max-age=300", true);
  }

  private getStorage() {
    this.storage ??= {
      bucket: requiredEnvironment("S3_BUCKET_NAME"),
      client: new S3Client({
        credentials: {
          accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID"),
          secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY"),
        },
        endpoint: new URL(requiredEnvironment("S3_ENDPOINT")).origin,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        region: requiredEnvironment("S3_REGION"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    };
    return this.storage;
  }

  private async getObjectResponse(
    key: string,
    options: { cacheControl: string; contentType?: string; fileName?: string | null },
  ): Promise<TopLevelBinaryResponse> {
    const storage = this.getStorage();
    try {
      const object = await storage.client.send(
        new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
      );
      if (!object.Body || !(object.Body instanceof Readable)) {
        throw new Error("S3 returned no stream");
      }
      return {
        body: object.Body,
        headers: binaryHeaders({
          cacheControl: options.cacheControl,
          contentLength: object.ContentLength,
          contentType: options.contentType ?? object.ContentType,
          fileName: options.fileName,
        }),
      };
    } catch (error) {
      if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name)) {
        throw new NotFoundException("Stored file is unavailable", {
          errorCode: "PUBLIC_FILE_NOT_FOUND",
        });
      }
      throw error;
    }
  }

  private async getCandidateResumeObject(
    candidateId: string,
    cacheControl: string,
    preview = false,
  ) {
    const [row] = await this.database
      .select({
        fileName: studioInterview.resumeFileName,
        storageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, candidateId))
      .limit(1);
    if (!row?.storageKey) {
      throw new NotFoundException("Resume file not found", {
        errorCode: "PUBLIC_RESUME_FILE_NOT_FOUND",
      });
    }
    if (preview) {
      if (!row.fileName?.toLocaleLowerCase().endsWith(".pptx")) {
        throw new UnsupportedMediaTypeException("Only PPTX resume preview is supported", {
          errorCode: "PUBLIC_RESUME_PREVIEW_UNSUPPORTED",
        });
      }
      const storage = this.getStorage();
      const object = await storage.client.send(
        new GetObjectCommand({ Bucket: storage.bucket, Key: row.storageKey }),
      );
      if (!object.Body) {
        throw new NotFoundException("Resume file not found", {
          errorCode: "PUBLIC_RESUME_FILE_NOT_FOUND",
        });
      }
      try {
        const pdf = await convertPptxToPdf(await object.Body.transformToByteArray());
        return {
          body: pdf,
          headers: binaryHeaders({
            cacheControl,
            contentLength: pdf.byteLength,
            contentType: "application/pdf",
            fileName: row.fileName.replace(/\.pptx$/iu, ".pdf"),
          }),
        };
      } catch {
        throw new InternalServerErrorException("PPTX preview conversion failed", {
          errorCode: "PUBLIC_RESUME_PREVIEW_FAILED",
        });
      }
    }
    return this.getObjectResponse(row.storageKey, {
      cacheControl,
      fileName: row.fileName ?? "resume.pdf",
    });
  }

  private publicCandidate(candidate: typeof studioInterview.$inferSelect) {
    const {
      resumeStorageKey: _resumeStorageKey,
      candidateInviteTokenHash: _candidateInviteTokenHash,
      ...safe
    } = candidate as typeof candidate & { candidateInviteTokenHash?: unknown };
    return safe;
  }

  private async loadDuplicateSummary(candidateId: string, organizationId: string) {
    const columns = {
      createdAt: duplicateCandidate.createdAt,
      creatorImage: duplicateCreator.image,
      creatorName: duplicateCreator.name,
      level: resumeDuplicateMatch.level,
      otherId: duplicateCandidate.id,
      score: resumeDuplicateMatch.score,
    };
    const [sourceRows, matchedRows] = await Promise.all([
      this.database
        .select(columns)
        .from(resumeDuplicateMatch)
        .innerJoin(
          duplicateCandidate,
          and(
            eq(duplicateCandidate.id, resumeDuplicateMatch.matchedSourceId),
            eq(duplicateCandidate.organizationId, resumeDuplicateMatch.organizationId),
          ),
        )
        .leftJoin(duplicateCreator, eq(duplicateCandidate.createdBy, duplicateCreator.id))
        .where(
          and(
            eq(resumeDuplicateMatch.organizationId, organizationId),
            eq(resumeDuplicateMatch.sourceType, "studio_interview"),
            eq(resumeDuplicateMatch.sourceId, candidateId),
            eq(resumeDuplicateMatch.matchedSourceType, "studio_interview"),
            inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
          ),
        ),
      this.database
        .select(columns)
        .from(resumeDuplicateMatch)
        .innerJoin(
          duplicateCandidate,
          and(
            eq(duplicateCandidate.id, resumeDuplicateMatch.sourceId),
            eq(duplicateCandidate.organizationId, resumeDuplicateMatch.organizationId),
          ),
        )
        .leftJoin(duplicateCreator, eq(duplicateCandidate.createdBy, duplicateCreator.id))
        .where(
          and(
            eq(resumeDuplicateMatch.organizationId, organizationId),
            eq(resumeDuplicateMatch.sourceType, "studio_interview"),
            eq(resumeDuplicateMatch.matchedSourceType, "studio_interview"),
            eq(resumeDuplicateMatch.matchedSourceId, candidateId),
            inArray(resumeDuplicateMatch.status, ["active", "confirmed"]),
          ),
        ),
    ]);
    const bestByCandidate = new Map<string, (typeof sourceRows)[number]>();
    for (const row of [...sourceRows, ...matchedRows]) {
      const existing = bestByCandidate.get(row.otherId);
      if (!existing || row.score > existing.score) {
        bestByCandidate.set(row.otherId, row);
      }
    }
    const rows = [...bestByCandidate.values()];
    if (rows.length === 0) {
      return null;
    }
    const highConfidence = rows.filter((row) => row.score >= 90);
    if (highConfidence.length > 0) {
      const latest = highConfidence.toSorted(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];
      return {
        count: highConfidence.length,
        highestLevel: "high" as const,
        ...(latest
          ? {
              latestMatchedResume: {
                createdAt: latest.createdAt.toISOString(),
                creatorImage: latest.creatorImage,
                creatorName: latest.creatorName,
              },
            }
          : {}),
      };
    }
    const rank = { high: 2, low: 0, medium: 1 } as const;
    const highest = rows
      .map((row) => (row.level === "high" ? ("medium" as const) : row.level))
      .toSorted((left, right) => rank[right] - rank[left])[0];
    return { count: rows.length, highestLevel: highest ?? null };
  }

  private async hydrateReports(reports: (typeof interviewConversation.$inferSelect)[]) {
    if (reports.length === 0) {
      return [];
    }
    const turns = await this.database
      .select()
      .from(interviewConversationTurn)
      .where(
        inArray(
          interviewConversationTurn.conversationId,
          reports.map((report) => report.conversationId),
        ),
      )
      .orderBy(asc(interviewConversationTurn.createdAt), asc(interviewConversationTurn.receivedAt));
    return reports.map((report) => {
      const persistedTurns = turns.filter((turn) => turn.conversationId === report.conversationId);
      return buildPublicConversationReport(report, persistedTurns);
    });
  }

  private async resolveReferral(token: string) {
    const hash = createHash("sha256").update(token).digest("hex");
    const [row] = await this.database
      .select({
        createdBy: referralLink.createdBy,
        jobDescriptionCode: jobDescription.code,
        jobDescriptionId: referralLink.jobDescriptionId,
        jobDescriptionName: jobDescription.name,
        organizationId: referralLink.organizationId,
        organizationName: organization.name,
        referrerName: user.name,
      })
      .from(referralLink)
      .innerJoin(
        jobDescription,
        and(
          eq(referralLink.jobDescriptionId, jobDescription.id),
          eq(referralLink.organizationId, jobDescription.organizationId),
        ),
      )
      .innerJoin(organization, eq(referralLink.organizationId, organization.id))
      .leftJoin(user, eq(referralLink.createdBy, user.id))
      .where(
        and(
          eq(referralLink.tokenHash, hash),
          isNull(referralLink.disabledAt),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException("Referral link is unavailable", {
        errorCode: "PUBLIC_REFERRAL_NOT_FOUND",
      });
    }
    return row;
  }

  private async readMultipartResume(request: Request) {
    const contentType = request.headers["content-type"] ?? "";
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/iu.exec(contentType)?.slice(1).find(Boolean);
    if (!boundary) {
      throw new UnsupportedMediaTypeException("multipart/form-data is required", {
        errorCode: "PUBLIC_REFERRAL_MULTIPART_REQUIRED",
      });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    if (body.length > 20 * 1024 * 1024) {
      throw new UnsupportedMediaTypeException("Resume file is too large", {
        errorCode: "PUBLIC_REFERRAL_FILE_TOO_LARGE",
      });
    }
    const marker = Buffer.from(`--${boundary}`);
    for (
      let start = body.indexOf(marker);
      start >= 0;
      start = body.indexOf(marker, start + marker.length)
    ) {
      const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
      if (headerEnd === -1) {
        continue;
      }
      const headers = body.subarray(start + marker.length, headerEnd).toString("utf-8");
      if (!/name="resume"/iu.test(headers)) {
        continue;
      }
      const fileName = /filename="([^"]+)"/iu.exec(headers)?.[1]?.trim();
      const nextBoundary = body.indexOf(marker, headerEnd + 4);
      if (!fileName || nextBoundary === -1) {
        break;
      }
      const bytes = body.subarray(headerEnd + 4, Math.max(headerEnd + 4, nextBoundary - 2));
      const mediaType =
        /content-type:\s*([^\r\n]+)/iu.exec(headers)?.[1]?.trim() ?? "application/octet-stream";
      if (
        !(
          fileName.toLocaleLowerCase().endsWith(".pdf") ||
          fileName.toLocaleLowerCase().endsWith(".docx")
        )
      ) {
        throw new UnsupportedMediaTypeException("Only PDF and DOCX resumes are supported", {
          errorCode: "PUBLIC_REFERRAL_FILE_TYPE_UNSUPPORTED",
        });
      }
      return new File([bytes], fileName, { type: mediaType });
    }
    throw new UnsupportedMediaTypeException("Resume file is required", {
      errorCode: "PUBLIC_REFERRAL_FILE_REQUIRED",
    });
  }

  private async requireRoundScope(id: string) {
    const [asRound] = await this.database
      .select({
        candidateId: studioInterviewSchedule.interviewRecordId,
        organizationId: studioInterviewSchedule.organizationId,
        roundId: studioInterviewSchedule.id,
      })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.id, id))
      .limit(1);
    if (asRound) {
      return asRound;
    }
    const [asCandidate] = await this.database
      .select({
        candidateId: studioInterviewSchedule.interviewRecordId,
        organizationId: studioInterviewSchedule.organizationId,
        roundId: studioInterviewSchedule.id,
      })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.interviewRecordId, id))
      .orderBy(desc(studioInterviewSchedule.sortOrder), desc(studioInterviewSchedule.createdAt))
      .limit(1);
    if (!asCandidate) {
      throw new NotFoundException("Interview round not found", {
        errorCode: "PUBLIC_INTERVIEW_ROUND_NOT_FOUND",
      });
    }
    return asCandidate;
  }

  private async resolveCandidateMeeting(inviteToken: string) {
    const payload = parseSignedToken(inviteToken);
    if (!payload || !("roundId" in payload) || payload.exp < Date.now()) {
      return null;
    }
    const [row] = await this.database
      .select({
        candidateInviteExpiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
        candidateInviteStatus: studioHumanInterviewMeetingRound.candidateInviteStatus,
        candidateInviteTokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
        candidateName: studioInterview.candidateName,
        interviewRecordId: studioHumanInterviewRound.interviewRecordId,
        liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
        meetingId: studioHumanInterviewMeeting.id,
        organizationId: studioHumanInterviewMeeting.organizationId,
        roundId: studioHumanInterviewRound.id,
        roundLabel: studioHumanInterviewRound.label,
        scheduledAt: studioHumanInterviewMeeting.scheduledAt,
        status: studioHumanInterviewMeeting.status,
        title: studioHumanInterviewMeeting.title,
        validUntil: studioHumanInterviewMeeting.validUntil,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
      )
      .innerJoin(
        studioHumanInterviewRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioInterview,
        eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id),
      )
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
          eq(studioHumanInterviewMeetingRound.candidateInviteTokenHash, tokenHash(inviteToken)),
        ),
      )
      .limit(1);
    return row?.candidateInviteExpiresAt && row.candidateInviteExpiresAt >= new Date() ? row : null;
  }

  private async isCurrentHumanInvitationToken(inviteToken: string) {
    const payload = parseSignedToken(inviteToken);
    if (!payload || !("roundId" in payload)) {
      return false;
    }
    const [row] = await this.database
      .select({ tokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash })
      .from(studioHumanInterviewMeetingRound)
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
        ),
      )
      .limit(1);
    return row?.tokenHash === tokenHash(inviteToken);
  }

  private async recordHumanInvitationException(
    inviteToken: string,
    exceptionType: "invitation_expired" | "response_conflict" | "system_error",
  ) {
    if (!notificationFlowEnabled()) {
      return false;
    }
    const payload = parseSignedToken(inviteToken);
    if (!payload || !("roundId" in payload)) {
      return false;
    }
    const copy = {
      invitation_expired: {
        label: "邀请已过期",
        suggestedAction: "请重新发起本次面试邀请，或人工联系候选人确认面试意向。",
      },
      response_conflict: {
        label: "确认状态冲突",
        suggestedAction: "请人工联系候选人确认最终面试意向，必要时重新发起邀请。",
      },
      system_error: {
        label: "系统处理失败",
        suggestedAction: "请让候选人稍后重试；如持续失败，请人工确认并联系系统责任人。",
      },
    }[exceptionType];
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          interviewRecordId: studioHumanInterviewRound.interviewRecordId,
          invitationVersion: studioHumanInterviewMeetingRound.invitationVersion,
          organizationId: studioHumanInterviewMeeting.organizationId,
          scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
          tokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
        })
        .from(studioHumanInterviewMeetingRound)
        .innerJoin(
          studioHumanInterviewMeeting,
          eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
        )
        .innerJoin(
          studioHumanInterviewRound,
          eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
        )
        .where(
          and(
            eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
            eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
          ),
        )
        .limit(1)
        .for("update");
      if (!row || row.tokenHash !== tokenHash(inviteToken)) {
        return false;
      }
      await enqueuePreparedNotificationEvent(transaction, {
        actorUserId: null,
        dedupeKey: buildInterviewNotificationDedupeKey({
          discriminator: `${exceptionType}:${row.invitationVersion}`,
          scopeId: payload.meetingId,
          type: "human_invitation_exception",
          version: row.scheduleVersion,
        }),
        humanMeetingId: payload.meetingId,
        humanRoundId: payload.roundId,
        id: crypto.randomUUID(),
        interviewRecordId: row.interviewRecordId,
        organizationId: row.organizationId,
        payloadSnapshot: {
          exceptionType: copy.label,
          interviewType: "human",
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          suggestedAction: copy.suggestedAction,
          timeZone: "Asia/Shanghai",
        },
        scopeType: "human_meeting",
        type: "human_invitation_exception",
      });
      return true;
    });
  }

  private async resolveInterviewerMeeting(inviteToken: string) {
    const payload = parseSignedToken(inviteToken);
    if (!payload || !("userId" in payload) || payload.exp < Date.now()) {
      return null;
    }
    const [row] = await this.database
      .select({
        interviewerName: user.name,
        liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
        meetingId: studioHumanInterviewMeeting.id,
        organizationId: studioHumanInterviewMeeting.organizationId,
        role: studioHumanInterviewMeetingInterviewer.role,
        scheduledAt: studioHumanInterviewMeeting.scheduledAt,
        status: studioHumanInterviewMeeting.status,
        title: studioHumanInterviewMeeting.title,
        userId: studioHumanInterviewMeetingInterviewer.userId,
        validUntil: studioHumanInterviewMeeting.validUntil,
      })
      .from(studioHumanInterviewMeetingInterviewer)
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeetingInterviewer.meetingId, studioHumanInterviewMeeting.id),
      )
      .innerJoin(user, eq(studioHumanInterviewMeetingInterviewer.userId, user.id))
      .where(
        and(
          eq(studioHumanInterviewMeetingInterviewer.meetingId, payload.meetingId),
          eq(studioHumanInterviewMeetingInterviewer.userId, payload.userId),
          eq(studioHumanInterviewMeetingInterviewer.role, payload.role),
        ),
      )
      .limit(1);
    if (!row) {
      return null;
    }
    const [candidate] = await this.database
      .select({
        candidateName: studioInterview.candidateName,
        roundLabel: studioHumanInterviewRound.label,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioInterview,
        eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id),
      )
      .where(eq(studioHumanInterviewMeetingRound.meetingId, row.meetingId))
      .orderBy(asc(studioHumanInterviewRound.sortOrder))
      .limit(1);
    return candidate
      ? { ...row, ...candidate, interviewerName: row.interviewerName ?? "未命名" }
      : null;
  }

  private async requireCandidateMeeting(token: string): Promise<NonNullable<CandidateScope>> {
    const scope = await this.resolveCandidateMeeting(token);
    if (!scope) {
      throw new NotFoundException("Human interview invitation is unavailable", {
        errorCode: "HUMAN_INTERVIEW_INVITATION_NOT_FOUND",
      });
    }
    return scope;
  }

  private async requireInterviewerMeeting(token: string): Promise<NonNullable<InterviewerScope>> {
    const scope = await this.resolveInterviewerMeeting(token);
    if (!scope) {
      throw new NotFoundException("Interviewer invitation is unavailable", {
        errorCode: "HUMAN_INTERVIEW_INTERVIEWER_INVITATION_NOT_FOUND",
      });
    }
    return scope;
  }

  private publicInterviewerScope(scope: NonNullable<InterviewerScope>) {
    return {
      candidateName: scope.candidateName,
      interviewerName: scope.interviewerName,
      meetingId: scope.meetingId,
      role: scope.role,
      roundLabel: scope.roundLabel,
      scheduledAt: scope.scheduledAt?.toISOString() ?? null,
      status: scope.status,
      title: scope.title,
      validUntil: scope.validUntil?.toISOString() ?? null,
    };
  }

  private assertMeetingJoinable(scope: {
    liveKitRoomName: string | null;
    scheduledAt: Date | null;
    status: string;
    validUntil: Date | null;
  }) {
    if (["cancelled", "ended"].includes(scope.status)) {
      throw new ForbiddenException("Human interview has ended or was cancelled", {
        errorCode: "HUMAN_INTERVIEW_ENDED",
      });
    }
    if (scope.status === "scheduled" && isBeforeJoinWindow(scope.scheduledAt)) {
      throw new ForbiddenException("Human interview is not open yet", {
        errorCode: "HUMAN_INTERVIEW_TOO_EARLY",
      });
    }
    if (!scope.validUntil || scope.validUntil < new Date()) {
      throw new GoneException("Human interview has expired", {
        errorCode: "HUMAN_INTERVIEW_EXPIRED",
      });
    }
    if (!scope.liveKitRoomName) {
      throw new ConflictException("Human interview room is not ready", {
        errorCode: "HUMAN_INTERVIEW_ROOM_NOT_READY",
      });
    }
  }

  private async signHumanMeetingToken(input: {
    canPublish: boolean;
    identity: string;
    metadata: Record<string, string>;
    name: string;
    role: string;
    roomName: string | null;
  }) {
    if (!input.roomName) {
      throw new ConflictException("Human interview room is not ready", {
        errorCode: "HUMAN_INTERVIEW_ROOM_NOT_READY",
      });
    }
    const token = new AccessToken(
      requiredEnvironment("LIVEKIT_API_KEY"),
      requiredEnvironment("LIVEKIT_API_SECRET"),
      {
        identity: input.identity,
        metadata: JSON.stringify(input.metadata),
        name: input.name,
        ttl: "15m",
      },
    );
    token.addGrant({
      canPublish: input.canPublish,
      canPublishData: true,
      canSubscribe: true,
      room: input.roomName,
      roomJoin: true,
    });
    return {
      participantRole: input.role,
      participantToken: await token.toJwt(),
      roomName: input.roomName,
      serverUrl: requiredEnvironment("LIVEKIT_URL"),
    };
  }

  private roomService() {
    return new RoomServiceClient(
      requiredEnvironment("LIVEKIT_URL").replace(/^ws/iu, "http"),
      requiredEnvironment("LIVEKIT_API_KEY"),
      requiredEnvironment("LIVEKIT_API_SECRET"),
    );
  }

  private async requireMaterialsScope(token: string) {
    const scope = await this.requireInterviewerMeeting(token);
    if (scope.status === "cancelled" || !scope.validUntil || scope.validUntil < new Date()) {
      throw new GoneException("Candidate materials are unavailable", {
        errorCode: "HUMAN_INTERVIEW_MATERIALS_UNAVAILABLE",
      });
    }
    return scope;
  }

  private materialCandidate(scope: NonNullable<InterviewerScope>, candidateId: string) {
    return this.database
      .select({
        candidateEmail: studioInterview.candidateEmail,
        candidateName: studioInterview.candidateName,
        candidatePhone: studioInterview.candidatePhone,
        creatorName: candidateCreator.name,
        id: studioInterview.id,
        interviewQuestions: studioInterview.interviewQuestions,
        jobDescriptionName: jobDescription.name,
        qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
        resumeFileName: studioInterview.resumeFileName,
        resumeProfile: studioInterview.resumeProfile,
        resumeReviewStatus: studioInterview.resumeReviewStatus,
        resumeStorageKey: studioInterview.resumeStorageKey,
        targetRole: studioInterview.targetRole,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioInterview,
        eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id),
      )
      .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
      .leftJoin(candidateCreator, eq(studioInterview.createdBy, candidateCreator.id))
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, scope.meetingId),
          eq(studioInterview.id, candidateId),
          eq(studioInterview.organizationId, scope.organizationId),
        ),
      )
      .limit(1);
  }

  private async assertMaterialCandidate(scope: NonNullable<InterviewerScope>, candidateId: string) {
    const [row] = await this.materialCandidate(scope, candidateId);
    if (!row) {
      this.materialNotFound();
    }
  }

  private materialNotFound(): never {
    throw new NotFoundException("Candidate material not found", {
      errorCode: "HUMAN_INTERVIEW_CANDIDATE_MATERIAL_NOT_FOUND",
    });
  }

  private async recordMaterialView(scope: NonNullable<InterviewerScope>, candidateId: string) {
    const fingerprint = createHash("sha256")
      .update(`${scope.meetingId}\0${candidateId}\0${scope.userId}`)
      .digest("hex");
    await this.database
      .insert(interviewAuditLog)
      .values({
        action: "human_interview.candidate_materials_viewed",
        detail: { meetingId: scope.meetingId },
        id: `human-interview-candidate-view:${fingerprint}`,
        interviewRecordId: candidateId,
        operatorId: scope.userId,
        organizationId: scope.organizationId,
      })
      .onConflictDoNothing();
  }
}
