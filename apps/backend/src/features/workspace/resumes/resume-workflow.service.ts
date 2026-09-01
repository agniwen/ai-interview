/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, complexity, max-lines -- Resume detail, evaluation, launch, history, and legacy JSON serialization share one authorization and transactional parity boundary; stored payloads are parsed before domain use. */
import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  applyGateCorrection,
  deriveStructuredResumeSummaries,
} from "@arc/shared/structured-resume-scoring";
import { getResumeReviewBaseScore } from "@arc/shared/resume-review";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import {
  enqueueResumeParseJobs,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@arc/resume-parse-queue/resume-review-generation";
import { enqueueResumeSemanticIndexJobs } from "@arc/resume-parse-queue/resume-semantic-index";
import {
  interviewAuditLog,
  jobDescription,
  jobDescriptionVersion,
  meetingRecruitingContext,
  meetingSession,
  resumeDuplicateMatch,
  resumeEvaluationFailure,
  resumeEvaluationVersion,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import { and, asc, count, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT, WORKSPACE_RESUME_SEMANTIC_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort, WorkspaceResumeSemanticPort } from "../workspace.ports.js";
import { ResumeUploadBatchService } from "../resume-upload-batches/resume-upload-batch.service.js";
import type { UploadedResumeFile } from "../resume-upload-batches/resume-upload-batch.service.js";
import type {
  resumeBulkDeleteSchema,
  resumeCreateSchema,
  resumeEditSchema,
  resumeEvaluationPatchSchema,
  resumeEvaluationSubmitSchema,
  resumeGateCorrectionSchema,
  resumeIdentitySchema,
  resumeLaunchSchema,
  resumeListQuerySchema,
} from "./resume-core.schemas.js";

type ListQuery = z.infer<typeof resumeListQuerySchema>;
type CreateInput = z.infer<typeof resumeCreateSchema>;
type EditInput = z.infer<typeof resumeEditSchema>;
type IdentityInput = z.infer<typeof resumeIdentitySchema>;
type EvalInput = z.infer<typeof resumeEvaluationPatchSchema>;
type SubmitInput = z.infer<typeof resumeEvaluationSubmitSchema>;
type LaunchInput = z.infer<typeof resumeLaunchSchema>;
type GateInput = z.infer<typeof resumeGateCorrectionSchema>;
type BulkInput = z.infer<typeof resumeBulkDeleteSchema>;
type Row = typeof studioInterview.$inferSelect;
function csv(value: string | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function serialize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

@Injectable()
export class ResumeWorkflowService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_RESUME_SEMANTIC_PORT) private readonly semantic: WorkspaceResumeSemanticPort,
    @Inject(ResumeUploadBatchService) private readonly uploads: ResumeUploadBatchService,
  ) {}
  private visibility(visible: string[] | null) {
    return visible ? inArray(studioInterview.createdBy, visible) : undefined;
  }
  private async row(
    organizationId: string,
    id: string,
    visible: string[] | null,
    membershipOnly = false,
  ) {
    const rows = await this.database
      .select()
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          membershipOnly ? undefined : this.visibility(visible),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("记录不存在。", { errorCode: "RESUME_RECORD_NOT_FOUND" });
    }
    return rows[0];
  }
  private async detailFrom(row: Row) {
    const [creator, job, aiRounds, humanRounds] = await Promise.all([
      row.createdBy
        ? this.database
            .select({ image: user.image, name: user.name })
            .from(user)
            .where(eq(user.id, row.createdBy))
            .limit(1)
        : Promise.resolve([]),
      row.jobDescriptionId
        ? this.database
            .select({ evaluationMode: jobDescription.evaluationMode, name: jobDescription.name })
            .from(jobDescription)
            .where(eq(jobDescription.id, row.jobDescriptionId))
            .limit(1)
        : Promise.resolve([]),
      this.database
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, row.id))
        .orderBy(asc(studioInterviewSchedule.sortOrder)),
      this.database
        .select()
        .from(studioHumanInterviewRound)
        .where(eq(studioHumanInterviewRound.interviewRecordId, row.id))
        .orderBy(asc(studioHumanInterviewRound.sortOrder)),
    ]);
    const aiActive = aiRounds.find((round) => !["completed", "cancelled"].includes(round.status));
    const humanActive = humanRounds.find(
      (round) => !["completed", "cancelled"].includes(round.status),
    );
    return serialize({
      ...row,
      creatorImage: creator[0]?.image ?? null,
      creatorName: creator[0]?.name ?? null,
      creatorOrganizationName: null,
      duplicateMatch: null,
      feishuDocumentUrl: null,
      hasInterviewRounds: aiRounds.length > 0,
      hasResumeFile: Boolean(row.resumeStorageKey),
      jobDescriptionDepartmentName: null,
      jobDescriptionName: job[0]?.name ?? null,
      jobEvaluationMode: job[0]?.evaluationMode ?? null,
      lastInterviewAt:
        [
          ...aiRounds.map((round) => round.scheduledAt),
          ...humanRounds.map((round) => round.scheduledAt),
        ]
          .filter((date): date is Date => Boolean(date))
          .toSorted((a, b) => b.getTime() - a.getTime())[0]
          ?.toISOString() ?? null,
      qualitativeResumeSummary: row.qualitativeResumeEvaluation?.conciseOverall ?? null,
      resumeParseRetryable: row.resumeParseStatus === "failed",
      resumeProfileSnapshot: row.resumeProfile ?? {},
      resumeReviewBaseScore: row.resumeReview ? getResumeReviewBaseScore(row.resumeReview) : null,
      resumeReviewNextStepAction: row.resumeReview?.nextStep?.action ?? null,
      resumeScreeningStale: false,
      resumeSkills: [
        ...new Set((row.resumeProfile?.skills ?? []).map((skill) => skill.trim()).filter(Boolean)),
      ],
      resumeSummary: row.resumeProfile?.personalStrengths?.join("；") || null,
      stageProgress: {
        aiInterview: aiRounds.length
          ? {
              activeRound: aiActive
                ? {
                    roundLabel: aiActive.roundLabel,
                    sortOrder: aiActive.sortOrder,
                    status: aiActive.status,
                  }
                : null,
              completedRounds: aiRounds.filter((round) => round.status === "completed").length,
              hasStarted: aiRounds.some((round) => round.status !== "pending"),
              totalRounds: aiRounds.length,
            }
          : null,
        humanInterview: humanRounds.length
          ? {
              activeRound: humanActive
                ? {
                    id: humanActive.id,
                    label: humanActive.label,
                    outcome: humanActive.outcome,
                    scheduledAt: humanActive.scheduledAt?.toISOString() ?? null,
                    sortOrder: humanActive.sortOrder,
                    status: humanActive.status,
                  }
                : null,
              completedRounds: humanRounds.filter((round) => round.status === "completed").length,
              completedRoundsMissingFeedback: humanRounds.filter(
                (round) => round.status === "completed" && !round.feedback,
              ).length,
              failedRounds: humanRounds.filter((round) => round.outcome === "fail").length,
              passedRounds: humanRounds.filter((round) => round.outcome === "pass").length,
              totalRounds: humanRounds.filter((round) => round.status !== "cancelled").length,
            }
          : null,
        offer: null,
      },
    });
  }
  async get(organizationId: string, id: string, visible: string[] | null, membershipOnly = false) {
    return this.detailFrom(await this.row(organizationId, id, visible, membershipOnly));
  }
  async list(organizationId: string, visible: string[] | null, query: ListQuery) {
    const creatorIds = csv(query.creatorIds);
    const jdIds = csv(query.jdIds);
    const outcomes = csv(query.outcomes);
    const stages = csv(query.pipelineStages);
    const recommendations = csv(query.recommendationLevels);
    const skills = csv(query.skills)?.map((item) => item.toLowerCase());
    const where = and(
      eq(studioInterview.organizationId, organizationId),
      this.visibility(visible),
      creatorIds?.length ? inArray(studioInterview.createdBy, creatorIds) : undefined,
      jdIds?.length ? inArray(studioInterview.jobDescriptionId, jdIds) : undefined,
      outcomes?.length ? inArray(studioInterview.outcome, outcomes as never[]) : undefined,
      stages?.length ? inArray(studioInterview.pipelineStage, stages as never[]) : undefined,
      recommendations?.length
        ? inArray(studioInterview.qualitativeRecommendationLevel, recommendations as never[])
        : undefined,
      skills?.length ? sql`${studioInterview.skillsNormalized} @> ${skills}` : undefined,
      query.structuredMinScore === undefined
        ? undefined
        : gte(studioInterview.structuredCompositeScore, query.structuredMinScore),
      query.structuredMaxScore === undefined
        ? undefined
        : sql`${studioInterview.structuredCompositeScore} <= ${query.structuredMaxScore}`,
      query.createdFrom
        ? gte(studioInterview.createdAt, new Date(`${query.createdFrom}T00:00:00+08:00`))
        : undefined,
      query.createdTo
        ? lt(
            studioInterview.createdAt,
            new Date(new Date(`${query.createdTo}T00:00:00+08:00`).getTime() + 86_400_000),
          )
        : undefined,
      query.search
        ? or(
            sql`${studioInterview.candidateName} ilike ${`%${query.search}%`}`,
            sql`${studioInterview.candidateEmail} ilike ${`%${query.search}%`}`,
            sql`${studioInterview.candidatePhone} ilike ${`%${query.search}%`}`,
          )
        : undefined,
    );
    const sortFields = {
      candidateName: studioInterview.candidateName,
      createdAt: studioInterview.createdAt,
      updatedAt: studioInterview.updatedAt,
    };
    const field = sortFields[query.sortBy];
    const [totals, rows] = await Promise.all([
      this.database.select({ total: count() }).from(studioInterview).where(where),
      this.database
        .select()
        .from(studioInterview)
        .where(where)
        .orderBy(query.sortOrder === "asc" ? asc(field) : desc(field), desc(studioInterview.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ]);
    const total = query.knownTotal ?? totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: await Promise.all(rows.map((row) => this.detailFrom(row))),
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
  async duplicates(organizationId: string, id: string, visible: string[] | null) {
    await this.row(organizationId, id, visible);
    const rows = await this.database
      .select()
      .from(resumeDuplicateMatch)
      .where(
        and(
          eq(resumeDuplicateMatch.organizationId, organizationId),
          eq(resumeDuplicateMatch.sourceId, id),
          eq(resumeDuplicateMatch.sourceType, "studio_interview"),
          eq(resumeDuplicateMatch.status, "active"),
        ),
      )
      .orderBy(desc(resumeDuplicateMatch.score));
    return { matches: serialize(rows) };
  }
  async timeline(
    organizationId: string,
    id: string,
    visible: string[] | null,
    membershipOnly = false,
  ) {
    const record = await this.row(organizationId, id, visible, membershipOnly);
    const [audits, ai, human] = await Promise.all([
      this.database
        .select({
          action: interviewAuditLog.action,
          actorImage: user.image,
          actorName: user.name,
          createdAt: interviewAuditLog.createdAt,
          detail: interviewAuditLog.detail,
          id: interviewAuditLog.id,
        })
        .from(interviewAuditLog)
        .leftJoin(user, eq(user.id, interviewAuditLog.operatorId))
        .where(eq(interviewAuditLog.interviewRecordId, id)),
      this.database
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, id)),
      this.database
        .select()
        .from(studioHumanInterviewRound)
        .where(eq(studioHumanInterviewRound.interviewRecordId, id)),
    ]);
    const events = [
      {
        actorImage: null,
        actorName: null,
        description: null,
        id: `candidate:${id}`,
        kind: "candidate",
        metadata: [],
        occurredAt: record.createdAt.toISOString(),
        title: "候选人已加入招聘台",
        tone: "info",
      },
      ...audits.map((event) => ({
        actorImage: event.actorImage,
        actorName: event.actorName,
        description: null,
        id: event.id,
        kind: "audit",
        metadata: Object.entries(event.detail ?? {}).map(([label, value]) => ({
          label,
          value: String(value ?? ""),
        })),
        occurredAt: event.createdAt.toISOString(),
        title: event.action,
        tone: "muted",
      })),
      ...ai.map((round) => ({
        actorImage: null,
        actorName: null,
        description: round.notes,
        id: `ai:${round.id}`,
        kind: "ai_interview",
        metadata: [{ label: "状态", value: round.status }],
        occurredAt: round.createdAt.toISOString(),
        title: round.roundLabel,
        tone: round.status === "completed" ? "success" : "info",
      })),
      ...human.map((round) => ({
        actorImage: null,
        actorName: null,
        description: round.feedback,
        id: `human:${round.id}`,
        kind: "human_interview",
        metadata: [{ label: "状态", value: round.status }],
        occurredAt: round.createdAt.toISOString(),
        title: round.label,
        tone: round.outcome === "fail" ? "danger" : "info",
      })),
    ].toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return {
      events,
      summary: {
        currentOutcomeLabel: record.outcome,
        currentStageLabel: record.pipelineStage,
        latestAt: events[0]?.occurredAt ?? null,
        totalEvents: events.length,
      },
    };
  }
  async rounds(
    organizationId: string,
    id: string,
    visible: string[] | null,
    membershipOnly = false,
  ) {
    await this.row(organizationId, id, visible, membershipOnly);
    const rows = await this.database
      .select()
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.interviewRecordId, id),
          eq(studioInterviewSchedule.organizationId, organizationId),
        ),
      )
      .orderBy(asc(studioInterviewSchedule.sortOrder));
    return serialize(rows);
  }
  async submitEvaluation(
    organizationId: string,
    actorId: string,
    id: string,
    input: SubmitInput,
    membershipOnly = false,
    visible: string[] | null = null,
  ) {
    await this.row(organizationId, id, visible, membershipOnly);
    const result = await this.database
      .update(studioInterview)
      .set({ resumeEvaluationStatus: input.status, updatedAt: new Date() })
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          sql`${studioInterview.resumeEvaluationStatus} is null`,
        ),
      )
      .returning({ id: studioInterview.id });
    if (!result[0]) {
      throw new ConflictException("该简历已评估，不能重复评估。");
    }
    await this.database.insert(interviewAuditLog).values({
      action: "resume_evaluation_updated",
      detail: { status: input.status },
      id: crypto.randomUUID(),
      interviewRecordId: id,
      operatorId: actorId,
      organizationId,
    });
    return this.get(organizationId, id, visible, membershipOnly);
  }
  async patchEvaluation(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    input: EvalInput,
  ) {
    await this.row(organizationId, id, visible);
    await this.database
      .update(studioInterview)
      .set({ resumeEvaluationStatus: input.status, updatedAt: new Date() })
      .where(eq(studioInterview.id, id));
    await this.database.insert(interviewAuditLog).values({
      action: "resume_evaluation_updated",
      detail: { status: input.status },
      id: crypto.randomUUID(),
      interviewRecordId: id,
      operatorId: actorId,
      organizationId,
    });
    return this.get(organizationId, id, visible);
  }
  async reassess(organizationId: string, id: string, visible: string[] | null) {
    const row = await this.row(organizationId, id, visible);
    if (row.pipelineStage === "closed") {
      throw new ConflictException("已结束候选人不能重新评估。");
    }
    if (row.resumeParseStatus !== "ready") {
      throw new ConflictException("简历解析完成后才能重新评估。");
    }
    if (!row.jobDescriptionId) {
      throw new ConflictException("请先关联在招岗位后再重新评估。");
    }
    if (!isResumeReviewGenerationQueueConfigured()) {
      throw new ServiceUnavailableException("简历评估队列未配置 REDIS_URL。");
    }
    const runId = crypto.randomUUID();
    await this.database
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewQueuedAt: new Date(),
        resumeReviewRunId: runId,
        resumeReviewStatus: "queued",
        updatedAt: new Date(),
      })
      .where(eq(studioInterview.id, id));
    await enqueueResumeReviewGenerationJobs([
      {
        force: true,
        jobDescriptionId: row.jobDescriptionId,
        organizationId,
        reassessToken: crypto.randomUUID(),
        resumeRecordId: id,
        runId,
        source: "reassess",
      },
    ]);
    return this.get(organizationId, id, visible);
  }
  async launch(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    input: LaunchInput,
  ) {
    const row = await this.row(organizationId, id, visible);
    if (row.pipelineStage === "closed") {
      throw new ConflictException("候选人已结束，请先「重新激活」后再发起 AI 面试。");
    }
    if (["human_interview", "offer"].includes(row.pipelineStage)) {
      throw new ConflictException("候选人已进入后续招聘阶段，不能再发起 AI 面试。");
    }
    if (row.resumeParseStatus !== "ready") {
      throw new ConflictException("简历解析完成后才能发起 AI 面试。");
    }
    if (
      row.structuredResumeEvaluation &&
      (!input.structuredEvaluationConfirmation ||
        input.structuredEvaluationConfirmation.runId !== row.resumeReviewRunId ||
        input.structuredEvaluationConfirmation.gateStatus !== row.structuredGateStatus ||
        input.structuredEvaluationConfirmation.grade !== row.structuredScoreGrade)
    ) {
      throw new ConflictException("简历评估结果已变化，请确认当前结果后再发起 AI 面试。");
    }
    const max = await this.database
      .select({ value: sql<number>`coalesce(max(${studioInterviewSchedule.sortOrder}), -1)` })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.interviewRecordId, id));
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const validityDaysByOption = {
      "1_day": 1,
      "3_days": 3,
      "7_days": 7,
      permanent: 7,
    };
    const validityDays = validityDaysByOption[input.candidateInviteValidity];
    const expires =
      input.candidateInviteValidity === "permanent"
        ? null
        : new Date(now.getTime() + validityDays * 86_400_000);
    const roundId = crypto.randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.insert(studioInterviewSchedule).values({
        candidateInviteExpiresAt: expires,
        candidateInviteStatus: "pending",
        candidateInviteTokenHash: createHash("sha256").update(token).digest("hex"),
        createdBy: actorId,
        id: roundId,
        interviewRecordId: id,
        organizationId,
        roundLabel: `第 ${(max[0]?.value ?? -1) + 2} 轮`,
        sortOrder: (max[0]?.value ?? -1) + 1,
        status: "pending",
      });
      await tx
        .update(studioInterview)
        .set({ pipelineStage: "ai_interview", updatedAt: now })
        .where(eq(studioInterview.id, id));
    });
    const rows = await this.database
      .select()
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.id, roundId))
      .limit(1);
    return serialize({ ...rows[0], candidateInviteToken: token });
  }
  async history(organizationId: string, id: string, visible: string[] | null) {
    const current = await this.row(organizationId, id, visible);
    const [rows, failures] = await Promise.all([
      this.database
        .select({
          artifact: resumeEvaluationVersion.artifact,
          contractVersion: resumeEvaluationVersion.contractVersion,
          createdAt: resumeEvaluationVersion.createdAt,
          id: resumeEvaluationVersion.id,
          jobDescriptionVersion: jobDescriptionVersion.version,
          jobDescriptionVersionId: resumeEvaluationVersion.jobDescriptionVersionId,
          numericScore: resumeEvaluationVersion.numericScore,
          recommendationLevel: resumeEvaluationVersion.recommendationLevel,
        })
        .from(resumeEvaluationVersion)
        .leftJoin(
          jobDescriptionVersion,
          eq(jobDescriptionVersion.id, resumeEvaluationVersion.jobDescriptionVersionId),
        )
        .where(
          and(
            eq(resumeEvaluationVersion.organizationId, organizationId),
            eq(resumeEvaluationVersion.resumeRecordId, id),
          ),
        )
        .orderBy(desc(resumeEvaluationVersion.createdAt)),
      this.database
        .select({
          contractVersion: resumeEvaluationFailure.contractVersion,
          createdAt: resumeEvaluationFailure.createdAt,
          errorMessage: resumeEvaluationFailure.errorMessage,
          id: resumeEvaluationFailure.id,
          jobDescriptionVersion: jobDescriptionVersion.version,
          jobDescriptionVersionId: resumeEvaluationFailure.jobDescriptionVersionId,
        })
        .from(resumeEvaluationFailure)
        .leftJoin(
          jobDescriptionVersion,
          eq(jobDescriptionVersion.id, resumeEvaluationFailure.jobDescriptionVersionId),
        )
        .where(
          and(
            eq(resumeEvaluationFailure.organizationId, organizationId),
            eq(resumeEvaluationFailure.resumeRecordId, id),
          ),
        )
        .orderBy(desc(resumeEvaluationFailure.createdAt)),
    ]);
    let marked = false;
    return {
      failures: serialize(failures),
      records: rows.map((row) => {
        const isCurrent =
          !marked &&
          row.contractVersion.startsWith("qualitative-v") &&
          row.jobDescriptionVersionId === current.qualitativeJobDescriptionVersionId;
        marked ||= isCurrent;
        return serialize({ ...row, isCurrent });
      }),
    };
  }
  async meetings(organizationId: string, id: string, visible: string[] | null) {
    await this.row(organizationId, id, visible);
    const [saved, human] = await Promise.all([
      this.database
        .select({ meeting: meetingSession })
        .from(meetingRecruitingContext)
        .innerJoin(meetingSession, eq(meetingSession.id, meetingRecruitingContext.meetingId))
        .where(
          and(
            eq(meetingRecruitingContext.organizationId, organizationId),
            eq(meetingRecruitingContext.recruitingRecordId, id),
          ),
        )
        .orderBy(desc(meetingSession.savedAt)),
      this.database
        .select({ meeting: studioHumanInterviewMeeting })
        .from(studioHumanInterviewRound)
        .innerJoin(
          studioHumanInterviewMeetingRound,
          eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
        )
        .innerJoin(
          studioHumanInterviewMeeting,
          eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
        )
        .where(
          and(
            eq(studioHumanInterviewRound.interviewRecordId, id),
            eq(studioHumanInterviewMeeting.organizationId, organizationId),
          ),
        )
        .orderBy(desc(studioHumanInterviewMeeting.scheduledAt)),
    ]);
    return {
      records: serialize([
        ...saved.map((item) => item.meeting),
        ...human.map((item) => item.meeting),
      ]),
    };
  }
  async correctGate(
    organizationId: string,
    actorId: string,
    id: string,
    requirementId: string,
    visible: string[] | null,
    input: GateInput,
  ) {
    const result = await this.database.transaction(async (tx) => {
      const rows = await tx
        .select({
          evaluation: studioInterview.structuredResumeEvaluation,
          runId: studioInterview.resumeReviewRunId,
          status: studioInterview.resumeReviewStatus,
        })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, id),
            eq(studioInterview.organizationId, organizationId),
            this.visibility(visible),
          ),
        )
        .for("update")
        .limit(1);
      const [row] = rows;
      if (!row) {
        throw new NotFoundException("记录不存在。");
      }
      if (row.status !== "ready" || !row.evaluation) {
        throw new ConflictException("当前结构化评估尚未完成。");
      }
      if (row.runId !== input.expectedRunId) {
        throw new ConflictException("评估结果已更新，请刷新后重试。");
      }
      const evaluation = structuredResumeEvaluationV1Schema.parse(row.evaluation);
      if (!evaluation.gates.judgments.some((gate) => gate.requirementId === requirementId)) {
        throw new NotFoundException("门槛条件不存在。");
      }
      const corrected = structuredResumeEvaluationV1Schema.parse(
        applyGateCorrection(evaluation, {
          correctedAt: new Date().toISOString(),
          correctedBy: actorId,
          correctedStatus: input.correctedStatus,
          requirementId,
        }),
      );
      const summaries = deriveStructuredResumeSummaries(corrected);
      await tx
        .update(studioInterview)
        .set({
          structuredGateSortRank: summaries.gateSortRank,
          structuredGateStatus: summaries.gateStatus,
          structuredResumeEvaluation: corrected,
          updatedAt: new Date(),
        })
        .where(eq(studioInterview.id, id));
      return { evaluation: corrected, status: "updated" as const, summaries };
    });
    return result;
  }
  private async assertJob(organizationId: string, id: string) {
    const rows = await this.database
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, id),
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new BadRequestException("所选在招岗位不存在。");
    }
  }
  private syncProfile(
    row: Row,
    input: Pick<
      IdentityInput,
      | "age"
      | "candidateEmail"
      | "candidateName"
      | "candidatePhone"
      | "gender"
      | "targetRole"
      | "workYears"
    >,
  ) {
    return row.resumeProfile
      ? {
          ...row.resumeProfile,
          age: input.age,
          email: input.candidateEmail || null,
          gender: input.gender || null,
          name: input.candidateName,
          phone: input.candidatePhone || null,
          targetRoles: input.targetRole
            ? [
                input.targetRole,
                ...row.resumeProfile.targetRoles.filter((role) => role !== input.targetRole),
              ]
            : row.resumeProfile.targetRoles,
          workYears: input.workYears,
        }
      : null;
  }
  async identity(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    input: IdentityInput,
  ) {
    await this.assertJob(organizationId, input.jobDescriptionId);
    const row = await this.row(organizationId, id, visible);
    if (!["ready", "failed"].includes(row.resumeParseStatus)) {
      throw new ConflictException("简历解析完成后才能编辑。");
    }
    const profile = this.syncProfile(row, input);
    const changed = row.jobDescriptionId !== input.jobDescriptionId;
    await this.database.transaction(async (tx) => {
      await tx
        .update(studioInterview)
        .set({
          candidateEmail: input.candidateEmail || null,
          candidateName: input.candidateName,
          candidatePhone: input.candidatePhone || null,
          jobDescriptionId: input.jobDescriptionId,
          qualitativeJobDescriptionVersionId: changed
            ? null
            : row.qualitativeJobDescriptionVersionId,
          qualitativeRecommendationLevel: changed ? null : row.qualitativeRecommendationLevel,
          qualitativeResumeEvaluation: changed ? null : row.qualitativeResumeEvaluation,
          resumeEvaluationStatus:
            input.resumeEvaluationStatus === "unreviewed" ? null : input.resumeEvaluationStatus,
          resumeProfile: profile,
          targetRole: input.targetRole || row.targetRole,
          updatedAt: new Date(),
        })
        .where(eq(studioInterview.id, id));
      if (changed) {
        await tx.insert(interviewAuditLog).values({
          action: "job_description_changed",
          detail: {
            fromJobDescriptionId: row.jobDescriptionId,
            toJobDescriptionId: input.jobDescriptionId,
          },
          id: crypto.randomUUID(),
          interviewRecordId: id,
          operatorId: actorId,
          organizationId,
        });
      }
    });
    if (profile) {
      await enqueueResumeSemanticIndexJobs([
        { organizationId, sourceId: id, sourceType: "studio_interview" },
      ]).catch((error) => console.error("[resumes] semantic enqueue failed", { error, id }));
    }
    return this.get(organizationId, id, visible);
  }
  async edit(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    input: EditInput,
  ) {
    const row = await this.row(organizationId, id, visible);
    await this.assertJob(organizationId, input.jobDescriptionId);
    const profile = row.resumeProfile
      ? {
          ...row.resumeProfile,
          email: input.candidateEmail || null,
          name: input.candidateName,
          phone: input.candidatePhone || null,
          targetRoles: input.targetRole ? [input.targetRole] : row.resumeProfile.targetRoles,
        }
      : null;
    await this.database
      .update(studioInterview)
      .set({
        candidateEmail: input.candidateEmail || null,
        candidateName: input.candidateName,
        candidatePhone: input.candidatePhone || null,
        hrResumeAssessment: input.hrResumeAssessment || null,
        hrResumeAssessmentUpdatedAt:
          row.hrResumeAssessment === input.hrResumeAssessment
            ? row.hrResumeAssessmentUpdatedAt
            : new Date(),
        hrResumeAssessmentUpdatedBy:
          row.hrResumeAssessment === input.hrResumeAssessment
            ? row.hrResumeAssessmentUpdatedBy
            : actorId,
        jobDescriptionId: input.jobDescriptionId,
        resumeEvaluationStatus:
          input.resumeEvaluationStatus === "unreviewed" ? null : input.resumeEvaluationStatus,
        resumeProfile: profile,
        targetRole: input.targetRole || null,
        updatedAt: new Date(),
      })
      .where(eq(studioInterview.id, id));
    if (profile) {
      await enqueueResumeSemanticIndexJobs([
        { organizationId, sourceId: id, sourceType: "studio_interview" },
      ]).catch((error) => console.error("[resumes] semantic enqueue failed", { error, id }));
    }
    return this.get(organizationId, id, visible);
  }
  async create(
    organizationId: string,
    actorId: string,
    input: CreateInput,
    file?: UploadedResumeFile,
  ) {
    if (!file) {
      throw new BadRequestException("请上传简历文件。");
    }
    await this.assertJob(organizationId, input.jobDescriptionId);
    if (!isResumeParseQueueConfigured()) {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。");
    }
    const source = await this.uploads.upload(organizationId, actorId, file);
    const id = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx.insert(studioInterview).values({
        candidateEmail: input.candidateEmail || null,
        candidateName:
          input.candidateName || file.originalname.replace(/\.[^.]+$/, "") || "未命名候选人",
        candidatePhone: input.candidatePhone || null,
        createdBy: actorId,
        hrResumeAssessment: input.hrResumeAssessment || null,
        id,
        jobDescriptionId: input.jobDescriptionId,
        notes: input.notes || null,
        organizationId,
        resumeContentHash: source.contentHash,
        resumeFileName: source.originalFileName,
        resumeParseStatus: "processing",
        resumeSourceType: "direct_upload",
        resumeStorageKey: source.storageKey,
        targetRole: input.targetRole || null,
      });
      await tx.insert(resumeUploadBatch).values({
        createdBy: actorId,
        dedupPolicy: "create",
        id: batchId,
        jdMode: "bind",
        jobDescriptionId: input.jobDescriptionId,
        organizationId,
        processedCount: 0,
        status: "running",
        target: "resume_library",
        totalCount: 1,
      });
      await tx.insert(resumeUploadBatchItem).values({
        attemptCount: 1,
        batchId,
        contentHash: source.contentHash,
        fileSize: source.fileSize,
        id: itemId,
        orderIndex: 0,
        organizationId,
        originalFileName: source.originalFileName,
        queuedAt: now,
        resumeRecordId: id,
        status: "pending",
        storageKey: source.storageKey,
      });
    });
    await enqueueResumeParseJobs([{ batchId, itemId, organizationId, userId: actorId }]);
    return this.get(organizationId, id, [actorId]);
  }
  async remove(organizationId: string, id: string, visible: string[] | null) {
    const row = await this.row(organizationId, id, visible);
    if (["queued", "processing"].includes(row.resumeParseStatus)) {
      throw new ConflictException("简历解析排队或处理中，暂不能删除。");
    }
    await this.database.delete(studioInterview).where(eq(studioInterview.id, id));
    return { success: true as const };
  }
  async bulkRemove(organizationId: string, input: BulkInput, visible: string[] | null) {
    const rows = await this.database
      .select({ id: studioInterview.id, resumeParseStatus: studioInterview.resumeParseStatus })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.organizationId, organizationId),
          inArray(studioInterview.id, input.ids),
          this.visibility(visible),
        ),
      );
    if (rows.some((row) => ["queued", "processing"].includes(row.resumeParseStatus))) {
      throw new ConflictException("所选记录包含解析排队或处理中的简历，暂不能删除。");
    }
    const deleted = rows.length
      ? await this.database
          .delete(studioInterview)
          .where(
            and(
              eq(studioInterview.organizationId, organizationId),
              inArray(
                studioInterview.id,
                rows.map((row) => row.id),
              ),
              this.visibility(visible),
            ),
          )
          .returning({ id: studioInterview.id })
      : [];
    return { deletedCount: deleted.length, success: true as const };
  }
}
