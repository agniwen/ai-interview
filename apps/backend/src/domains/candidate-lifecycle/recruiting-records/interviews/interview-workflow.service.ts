/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, complexity, max-lines -- Interview lifecycle transitions, reports, offers, human rounds, meetings, and legacy JSON serialization share one transactional parity boundary; external JSON and Drizzle projections are validated before use. */
import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import type { BackendEnvironmentKey } from "../../../../config/backend-environment.schema.js";
import { createHash, randomBytes } from "node:crypto";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  account,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateVersion,
  candidateFormSubmission,
  globalConfig,
  interviewAuditLog,
  interviewContextSnapshot,
  interviewConversation,
  interviewNotification,
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateVersion,
  jobDescription,
  member,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  studioInterviewNotificationRecipient,
  studioInterviewSchedule,
  studioOfferDraft,
  studioRoundEmailLog,
  user,
} from "@arc/db-schema/schema";
import type { InterviewContextSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import type { JsonObject } from "@arc/db-schema/json";
import type {
  CandidateExpectationsMeta,
  HumanInterviewMeetingInput,
  HumanInterviewMeetingScheduleUpdate,
  HumanInterviewRoundInput,
  OfferDraftInput,
  OfferResponseInput,
} from "@arc/db-schema/studio-interviews";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { Resend } from "resend";
import {
  canApplyCandidatePipelineEvent,
  getCandidatePipelineEventForTargetStage,
} from "@arc/shared/candidate-pipeline-machine";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import type { z } from "zod";
import { getFeishuTenantAccessToken } from "../../../../auth/feishu-oauth.js";
import { ResumeUploadBatchService } from "../../intake/upload-batches/resume-upload-batch.service.js";
import type { UploadedResumeFile } from "../../intake/upload-batches/resume-upload-batch.service.js";
import {
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_OBJECT_STORAGE_PORT,
} from "../../../../infrastructure/workspace/workspace.ports.js";
import type {
  WorkspaceDatabasePort,
  WorkspaceObjectStoragePort,
} from "../../../../infrastructure/workspace/workspace.ports.js";
import type {
  bulkInterviewDeleteSchema,
  completeHumanRoundSchema,
  createOfferDraftSchema,
  interviewListQuerySchema,
  interviewRoundPatchSchema,
  meetingListQuerySchema,
  recipientInputSchema,
  transitionInputSchema,
} from "./interview-workflow.schemas.js";

type ListQuery = z.infer<typeof interviewListQuerySchema>;
type RoundPatch = z.infer<typeof interviewRoundPatchSchema>;
type TransitionInput = z.infer<typeof transitionInputSchema>;
type CompleteRoundInput = z.infer<typeof completeHumanRoundSchema>;
type CreateOfferInput = z.infer<typeof createOfferDraftSchema>;
type BulkDeleteInput = z.infer<typeof bulkInterviewDeleteSchema>;
type RecipientInput = z.infer<typeof recipientInputSchema>;

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

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function optionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value ? new Date(value) : null;
}

function requiredEnvironment(name: BackendEnvironmentKey) {
  const value = rawBackendEnvironment[name]?.trim();
  if (!value) {
    throw new ServiceUnavailableException(`${name} 未配置。`);
  }
  return value;
}

@Injectable()
export class InterviewWorkflowService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_OBJECT_STORAGE_PORT) private readonly storage: WorkspaceObjectStoragePort,
    @Inject(ResumeUploadBatchService) private readonly uploads: ResumeUploadBatchService,
  ) {}

  private async candidate(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("候选人记录不存在。");
    }
    return rows[0];
  }

  private async round(organizationId: string, id: string, visible?: string[] | null) {
    const rows = await this.database
      .select({ candidate: studioInterview, round: studioInterviewSchedule })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .where(
        and(
          eq(studioInterviewSchedule.id, id),
          eq(studioInterviewSchedule.organizationId, organizationId),
          visible ? inArray(studioInterviewSchedule.createdBy, visible) : undefined,
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("记录不存在。");
    }
    return rows[0];
  }

  private async audit(input: {
    action: string;
    actorId: string | null;
    detail?: JsonObject;
    interviewRecordId: string;
    organizationId: string;
    scheduleEntryId?: string | null;
  }) {
    await this.database.insert(interviewAuditLog).values({
      action: input.action,
      detail: input.detail ?? {},
      id: crypto.randomUUID(),
      interviewRecordId: input.interviewRecordId,
      operatorId: input.actorId,
      organizationId: input.organizationId,
      scheduleEntryId: input.scheduleEntryId ?? null,
    });
  }

  async list(organizationId: string, visible: string[] | null, query: ListQuery) {
    const statuses = query.status
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const creators = query.creatorIds
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const textFilters = parseListTextFilters(query.textFilters);
    const textColumns = {
      candidateName: studioInterview.candidateName,
      email: studioInterview.candidateEmail,
      resumeFileName: studioInterview.resumeFileName,
      targetRole: studioInterview.targetRole,
      title: studioInterviewSchedule.roundLabel,
    };
    const textWhere = and(
      ...Object.entries(textFilters).flatMap(([key, value]) => {
        const column = textColumns[key as keyof typeof textColumns];
        const escaped = value.replaceAll(/[!%_]/g, "!$&");
        return column && value ? [sql`${column} ILIKE ${`%${escaped}%`} ESCAPE '!'`] : [];
      }),
    );
    const where = and(
      eq(studioInterviewSchedule.organizationId, organizationId),
      visible ? inArray(studioInterviewSchedule.createdBy, visible) : undefined,
      creators?.length ? inArray(studioInterviewSchedule.createdBy, creators) : undefined,
      statuses?.length ? inArray(studioInterviewSchedule.status, statuses as never[]) : undefined,
      query.search
        ? or(
            ilike(studioInterview.candidateName, `%${query.search}%`),
            ilike(studioInterview.candidateEmail, `%${query.search}%`),
            ilike(studioInterviewSchedule.roundLabel, `%${query.search}%`),
          )
        : undefined,
      textWhere,
    );
    const orderColumns = {
      candidateName: studioInterview.candidateName,
      createdAt: studioInterviewSchedule.createdAt,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduledAt: studioInterviewSchedule.scheduledAt,
    };
    const orderColumn = orderColumns[query.sortBy];
    const [totals, rows] = await Promise.all([
      this.database
        .select({ total: count() })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(where),
      this.database
        .select({ candidate: studioInterview, round: studioInterviewSchedule })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(where)
        .orderBy(
          query.sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn),
          desc(studioInterviewSchedule.id),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ]);
    const records = await Promise.all(
      rows.map(async ({ candidate, round }) => {
        const reports = await this.database
          .select({ total: count() })
          .from(interviewConversation)
          .where(eq(interviewConversation.scheduleEntryId, round.id));
        return serialize({
          ...round,
          ...candidate,
          candidateId: candidate.id,
          hasReport: (reports[0]?.total ?? 0) > 0,
          id: round.id,
          interviewRecordId: candidate.id,
        });
      }),
    );
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async resolve(organizationId: string, id: string, visible: string[] | null) {
    const rounds = await this.database
      .select({ id: studioInterviewSchedule.id })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.interviewRecordId, id),
          eq(studioInterviewSchedule.organizationId, organizationId),
          visible ? inArray(studioInterviewSchedule.createdBy, visible) : undefined,
        ),
      )
      .orderBy(asc(studioInterviewSchedule.sortOrder))
      .limit(1);
    if (rounds[0]) {
      return { id: rounds[0].id, kind: "candidate" as const };
    }
    const direct = await this.database
      .select({ id: studioInterviewSchedule.id })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.id, id),
          eq(studioInterviewSchedule.organizationId, organizationId),
          visible ? inArray(studioInterviewSchedule.createdBy, visible) : undefined,
        ),
      )
      .limit(1);
    if (!direct[0]) {
      throw new NotFoundException("记录不存在。");
    }
    return { id: direct[0].id, kind: "round" as const };
  }

  async create(
    organizationId: string,
    actorId: string,
    input: {
      candidateEmail: string;
      candidateName: string;
      candidatePhone: string;
      jobDescriptionId: string;
      manualInterviewQuestions?: unknown[];
      notes: string;
      resumePayload?: {
        fileName?: string;
        interviewQuestions?: unknown[];
        resumeProfile?: never;
        resumeText?: string;
      } | null;
      scheduleEntries: {
        allowTextInput: boolean;
        notes?: string;
        roundLabel: string;
        scheduledAt?: string;
        scheduledEndAt?: string;
        sortOrder: number;
      }[];
      targetRole: string;
    },
    resume?: UploadedResumeFile,
  ) {
    const jobs = await this.database
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, input.jobDescriptionId),
          eq(jobDescription.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!jobs[0]) {
      throw new BadRequestException("所选在招岗位不存在。");
    }
    const uploaded = resume ? await this.uploads.upload(organizationId, actorId, resume) : null;
    const id = crypto.randomUUID();
    const now = new Date();
    const rows = input.scheduleEntries.map((entry) => ({
      allowTextInput: entry.allowTextInput,
      createdAt: now,
      createdBy: actorId,
      id: crypto.randomUUID(),
      interviewRecordId: id,
      notes: entry.notes || null,
      organizationId,
      roundLabel: entry.roundLabel,
      scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt) : null,
      scheduledEndAt: entry.scheduledEndAt ? new Date(entry.scheduledEndAt) : null,
      sortOrder: entry.sortOrder,
      status: "pending" as const,
      updatedAt: now,
    }));
    await this.database.transaction(async (tx) => {
      await tx.insert(studioInterview).values({
        candidateEmail: input.candidateEmail || null,
        candidateName: input.candidateName,
        candidatePhone: input.candidatePhone || null,
        createdBy: actorId,
        id,
        interviewQuestions: (input.resumePayload?.interviewQuestions ??
          input.manualInterviewQuestions ??
          []) as never,
        jobDescriptionId: input.jobDescriptionId,
        notes: input.notes || null,
        organizationId,
        pipelineStage: "ai_interview",
        resumeContentHash: uploaded?.contentHash ?? null,
        resumeFileName: uploaded?.originalFileName ?? input.resumePayload?.fileName ?? null,
        resumeProfile: input.resumePayload?.resumeProfile ?? null,
        resumeStorageKey: uploaded?.storageKey ?? null,
        resumeText: input.resumePayload?.resumeText ?? null,
        targetRole: input.targetRole || null,
      });
      await tx.insert(studioInterviewSchedule).values(rows);
    });
    await this.ensureBindings(organizationId, id);
    await this.refreshSnapshot(organizationId, actorId, rows[0].id, "create");
    return this.detail(organizationId, rows[0].id, null);
  }

  async detail(organizationId: string, id: string, visible: string[] | null) {
    const result = await this.round(organizationId, id, visible);
    const [job, reports] = await Promise.all([
      result.candidate.jobDescriptionId
        ? this.database
            .select({ name: jobDescription.name })
            .from(jobDescription)
            .where(eq(jobDescription.id, result.candidate.jobDescriptionId))
            .limit(1)
        : Promise.resolve([]),
      this.database
        .select({
          conversationId: interviewConversation.conversationId,
          endedAt: interviewConversation.endedAt,
          recordingStatus: interviewConversation.recordingStatus,
          startedAt: interviewConversation.startedAt,
          summaryStatus: interviewConversation.summaryStatus,
        })
        .from(interviewConversation)
        .where(eq(interviewConversation.scheduleEntryId, id))
        .orderBy(desc(interviewConversation.createdAt)),
    ]);
    return serialize({
      ...result.round,
      candidate: result.candidate,
      candidateId: result.candidate.id,
      feishuDocumentUrl: null,
      hasReport: reports.length > 0,
      interviewAttempts: reports,
      jobDescriptionName: job[0]?.name ?? null,
    });
  }

  async patchRound(
    organizationId: string,
    actorId: string,
    id: string,
    visible: string[] | null,
    input: RoundPatch,
  ) {
    const current = await this.round(organizationId, id, visible);
    if (!["screening", "ai_interview"].includes(current.candidate.pipelineStage)) {
      throw new ConflictException("候选人已不在 AI 面试阶段，无法修改面试轮次。");
    }
    let start = current.round.scheduledAt;
    if (input.scheduledAt !== undefined) {
      start = optionalDate(input.scheduledAt) ?? null;
    }
    let end = current.round.scheduledEndAt;
    if (input.scheduledEndAt !== undefined) {
      end = optionalDate(input.scheduledEndAt) ?? null;
    }
    if (Boolean(start) !== Boolean(end)) {
      throw new BadRequestException("面试开始时间和结束时间需要同时填写。");
    }
    if (start && end && end <= start) {
      throw new BadRequestException("面试结束时间必须晚于开始时间。");
    }
    await this.database
      .update(studioInterviewSchedule)
      .set({
        allowTextInput: input.allowTextInput,
        notes: input.notes === undefined ? undefined : input.notes || null,
        scheduledAt: input.scheduledAt === undefined ? undefined : start,
        scheduledEndAt: input.scheduledEndAt === undefined ? undefined : end,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(studioInterviewSchedule.id, id));
    await this.audit({
      action: "ai_round_updated",
      actorId,
      interviewRecordId: current.candidate.id,
      organizationId,
      scheduleEntryId: id,
    });
    return this.detail(organizationId, id, visible);
  }

  async removeRound(organizationId: string, actorId: string, id: string) {
    const current = await this.round(organizationId, id);
    if (!["screening", "ai_interview"].includes(current.candidate.pipelineStage)) {
      throw new ConflictException("候选人已不在 AI 面试阶段，无法删除面试轮次。");
    }
    await this.database.transaction(async (tx) => {
      await tx
        .delete(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.id, id),
            eq(studioInterviewSchedule.organizationId, organizationId),
          ),
        );
      const remaining = await tx
        .select({ total: count() })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, current.candidate.id));
      if ((remaining[0]?.total ?? 0) === 0 && current.candidate.pipelineStage === "ai_interview") {
        await tx
          .update(studioInterview)
          .set({ pipelineStage: "screening", updatedAt: new Date() })
          .where(eq(studioInterview.id, current.candidate.id));
      }
    });
    return { success: true as const };
  }

  async bulkRemoveRounds(organizationId: string, input: BulkDeleteInput) {
    const targets = await this.database
      .select({
        id: studioInterviewSchedule.id,
        interviewRecordId: studioInterviewSchedule.interviewRecordId,
        pipelineStage: studioInterview.pipelineStage,
      })
      .from(studioInterviewSchedule)
      .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
      .where(
        and(
          eq(studioInterviewSchedule.organizationId, organizationId),
          inArray(studioInterviewSchedule.id, input.ids),
        ),
      );
    if (targets.some((item) => !["screening", "ai_interview"].includes(item.pipelineStage))) {
      throw new ConflictException("存在已超过 AI 面试阶段的候选人，无法批量删除。");
    }
    const deleted = await this.database
      .delete(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.organizationId, organizationId),
          inArray(
            studioInterviewSchedule.id,
            targets.map((item) => item.id),
          ),
        ),
      )
      .returning({ id: studioInterviewSchedule.id });
    for (const candidateId of new Set(targets.map((item) => item.interviewRecordId))) {
      const remaining = await this.database
        .select({ total: count() })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, candidateId));
      if ((remaining[0]?.total ?? 0) === 0) {
        await this.database
          .update(studioInterview)
          .set({ pipelineStage: "screening", updatedAt: new Date() })
          .where(
            and(
              eq(studioInterview.id, candidateId),
              eq(studioInterview.pipelineStage, "ai_interview"),
            ),
          );
      }
    }
    return { deletedCount: deleted.length, success: true as const };
  }

  async resetRound(organizationId: string, actorId: string, id: string, visible: string[] | null) {
    const current = await this.round(organizationId, id, visible);
    if (current.candidate.pipelineStage !== "ai_interview") {
      throw new ConflictException("候选人已不在 AI 面试阶段，无法重置面试轮次。");
    }
    await this.database.transaction(async (tx) => {
      await tx
        .update(studioInterviewSchedule)
        .set({
          candidateDeclineReason: null,
          candidateInviteStatus: "pending",
          candidateInviteTokenHash: null,
          candidateRespondedAt: null,
          conversationId: null,
          disconnectedAt: null,
          invitationVersion: current.round.invitationVersion + 1,
          liveKitParticipantIdentity: null,
          liveKitRoomName: null,
          sessionStartedAt: null,
          status: "pending",
          updatedAt: new Date(),
        })
        .where(eq(studioInterviewSchedule.id, id));
    });
    const snapshot = await this.refreshSnapshot(organizationId, actorId, id, "reset");
    await this.audit({
      action: "round_reset",
      actorId,
      detail: {
        previousConversationId: current.round.conversationId,
        previousStatus: current.round.status,
        snapshotId: snapshot.id,
      },
      interviewRecordId: current.candidate.id,
      organizationId,
      scheduleEntryId: id,
    });
    return this.detail(organizationId, id, visible);
  }

  async transition(organizationId: string, actorId: string, id: string, input: TransitionInput) {
    const current = await this.candidate(organizationId, id);
    const isReactivation = current.pipelineStage === "closed" && input.pipelineStage !== "closed";
    if (isReactivation && !input.reactivationReason) {
      throw new BadRequestException("重新激活时必须填写原因。");
    }
    if (input.pipelineStage === "human_interview" && !current.jobDescriptionId) {
      throw new BadRequestException("请先绑定在招岗位后再安排真人面试");
    }
    let humanInterviewReadyForOffer = false;
    if (current.pipelineStage === "human_interview" && input.pipelineStage === "offer") {
      const rounds = await this.database
        .select({
          feedback: studioHumanInterviewRound.feedback,
          status: studioHumanInterviewRound.status,
        })
        .from(studioHumanInterviewRound)
        .where(
          and(
            eq(studioHumanInterviewRound.interviewRecordId, id),
            eq(studioHumanInterviewRound.organizationId, organizationId),
            sql`${studioHumanInterviewRound.status} <> 'cancelled'`,
          ),
        );
      humanInterviewReadyForOffer =
        rounds.length > 0 &&
        rounds.every((round) => round.status === "completed" && Boolean(round.feedback?.trim()));
    }
    if (current.pipelineStage !== input.pipelineStage && input.pipelineStage !== "closed") {
      const event = getCandidatePipelineEventForTargetStage({
        from: current.pipelineStage,
        to: input.pipelineStage,
      });
      if (
        !event ||
        !canApplyCandidatePipelineEvent(
          { humanInterviewReadyForOffer, stage: current.pipelineStage },
          event,
        )
      ) {
        if (current.pipelineStage === "human_interview" && input.pipelineStage === "offer") {
          throw new BadRequestException("请先完成所有真人面试轮次，并补全每轮面试评价");
        }
        throw new BadRequestException("当前招聘阶段不能直接推进到目标阶段。");
      }
    }
    const now = new Date();
    const outcome = input.pipelineStage === "closed" ? input.outcome : "in_pipeline";
    const nextClosedMeta =
      input.pipelineStage === "closed"
        ? {
            ...current.closedMeta,
            ...input.closedMeta,
            internalNotes:
              input.closedMeta?.internalNotes ??
              input.closedReason ??
              current.closedMeta?.internalNotes,
            previousStage: current.pipelineStage,
          }
        : null;
    await this.database.transaction(async (tx) => {
      await tx
        .update(studioInterview)
        .set({
          closedAt: input.pipelineStage === "closed" ? now : null,
          closedMeta: nextClosedMeta,
          closedReason: input.closedReason ?? null,
          interviewQuestions: input.interviewQuestions,
          outcome,
          pipelineStage: input.pipelineStage,
          updatedAt: now,
        })
        .where(eq(studioInterview.id, id));
      await tx.insert(interviewAuditLog).values({
        action: isReactivation ? "candidate_reactivated" : "pipeline_stage_transition",
        detail: {
          from: current.pipelineStage,
          outcome,
          reason: input.reactivationReason ?? input.closedReason ?? null,
          to: input.pipelineStage,
        },
        id: crypto.randomUUID(),
        interviewRecordId: id,
        operatorId: actorId,
        organizationId,
      });
    });
    return { ok: true as const };
  }

  async updateExpectations(
    organizationId: string,
    id: string,
    input: Partial<CandidateExpectationsMeta>,
  ) {
    const row = await this.candidate(organizationId, id);
    const merged = { ...row.candidateExpectationsMeta, ...input };
    await this.database
      .update(studioInterview)
      .set({ candidateExpectationsMeta: merged, updatedAt: new Date() })
      .where(eq(studioInterview.id, id));
    return { candidateExpectationsMeta: merged };
  }

  async formSubmissions(organizationId: string, roundId: string) {
    const current = await this.round(organizationId, roundId);
    const rows = await this.database
      .select({
        answers: candidateFormSubmission.answers,
        id: candidateFormSubmission.id,
        interviewRecordId: candidateFormSubmission.interviewRecordId,
        snapshot: candidateFormTemplateVersion.snapshot,
        submittedAt: candidateFormSubmission.submittedAt,
        templateId: candidateFormSubmission.templateId,
        version: candidateFormTemplateVersion.version,
        versionId: candidateFormSubmission.versionId,
      })
      .from(candidateFormSubmission)
      .innerJoin(
        candidateFormTemplateVersion,
        eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
      )
      .where(
        and(
          eq(candidateFormSubmission.organizationId, organizationId),
          eq(candidateFormSubmission.interviewRecordId, current.candidate.id),
        ),
      )
      .orderBy(desc(candidateFormSubmission.submittedAt));
    return { submissions: serialize(rows) };
  }

  async deleteSubmission(
    organizationId: string,
    actorId: string,
    roundId: string,
    submissionId: string,
  ) {
    const current = await this.round(organizationId, roundId);
    const deleted = await this.database
      .delete(candidateFormSubmission)
      .where(
        and(
          eq(candidateFormSubmission.id, submissionId),
          eq(candidateFormSubmission.interviewRecordId, current.candidate.id),
          eq(candidateFormSubmission.organizationId, organizationId),
        ),
      )
      .returning({ id: candidateFormSubmission.id });
    if (!deleted[0]) {
      throw new NotFoundException("答卷不存在或已被重置。");
    }
    const snapshot = await this.refreshSnapshot(organizationId, actorId, roundId, "manual_refresh");
    await this.audit({
      action: "context_snapshot_refresh",
      actorId,
      detail: { reason: "form_submission_reset", snapshotId: snapshot.id, submissionId },
      interviewRecordId: current.candidate.id,
      organizationId,
      scheduleEntryId: roundId,
    });
    return { snapshot: serialize(snapshot), success: true as const };
  }

  async reports(organizationId: string, roundId: string, conversationId?: string) {
    await this.round(organizationId, roundId);
    const rows = await this.database
      .select()
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.organizationId, organizationId),
          eq(interviewConversation.scheduleEntryId, roundId),
          conversationId ? eq(interviewConversation.conversationId, conversationId) : undefined,
        ),
      )
      .orderBy(desc(interviewConversation.createdAt));
    if (conversationId && !rows[0]) {
      throw new NotFoundException("面试记录不存在。");
    }
    return serialize(conversationId ? rows[0] : rows);
  }

  async recording(organizationId: string, roundId: string, conversationId: string) {
    await this.round(organizationId, roundId);
    const rows = await this.database
      .select({
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.organizationId, organizationId),
          eq(interviewConversation.scheduleEntryId, roundId),
          eq(interviewConversation.conversationId, conversationId),
        ),
      )
      .limit(1);
    const [row] = rows;
    if (!row?.recordingFileKey) {
      throw new NotFoundException("本轮面试没有录像文件。");
    }
    if (row.recordingStatus !== "completed") {
      throw new ConflictException("录像尚未生成完成，请稍后再试。");
    }
    return { expiresInSeconds: 600, url: await this.storage.presignGet(row.recordingFileKey, 600) };
  }

  async bindings(organizationId: string, roundId: string) {
    const current = await this.round(organizationId, roundId);
    await this.ensureBindings(organizationId, current.candidate.id);
    const rows = await this.database
      .select({
        binding: interviewQuestionTemplateBinding,
        scope: interviewQuestionTemplate.scope,
        title: interviewQuestionTemplate.title,
        version: interviewQuestionTemplateVersion.version,
      })
      .from(interviewQuestionTemplateBinding)
      .innerJoin(
        interviewQuestionTemplate,
        eq(interviewQuestionTemplate.id, interviewQuestionTemplateBinding.templateId),
      )
      .innerJoin(
        interviewQuestionTemplateVersion,
        eq(interviewQuestionTemplateVersion.id, interviewQuestionTemplateBinding.versionId),
      )
      .where(
        and(
          eq(interviewQuestionTemplateBinding.organizationId, organizationId),
          eq(interviewQuestionTemplateBinding.interviewRecordId, current.candidate.id),
        ),
      )
      .orderBy(asc(interviewQuestionTemplateBinding.sortOrder));
    return serialize(rows.map(({ binding, ...rest }) => ({ ...binding, ...rest })));
  }

  async replaceBindings(organizationId: string, roundId: string, enabledTemplateIds: string[]) {
    const current = await this.round(organizationId, roundId);
    await this.ensureBindings(organizationId, current.candidate.id);
    const existing = await this.database
      .select()
      .from(interviewQuestionTemplateBinding)
      .where(
        and(
          eq(interviewQuestionTemplateBinding.organizationId, organizationId),
          eq(interviewQuestionTemplateBinding.interviewRecordId, current.candidate.id),
        ),
      );
    await this.database.transaction(async (tx) => {
      for (const binding of existing) {
        await tx
          .update(interviewQuestionTemplateBinding)
          .set({ disabledByUser: !enabledTemplateIds.includes(binding.templateId) })
          .where(eq(interviewQuestionTemplateBinding.id, binding.id));
      }
    });
    return this.bindings(organizationId, roundId);
  }

  private async ensureBindings(organizationId: string, interviewRecordId: string) {
    const candidate = await this.candidate(organizationId, interviewRecordId);
    const linked = candidate.jobDescriptionId
      ? await this.database
          .select({ templateId: interviewQuestionTemplateJobDescription.templateId })
          .from(interviewQuestionTemplateJobDescription)
          .where(
            eq(
              interviewQuestionTemplateJobDescription.jobDescriptionId,
              candidate.jobDescriptionId,
            ),
          )
      : [];
    const linkedIds = linked.map((item) => item.templateId);
    const templates = await this.database
      .select({ id: interviewQuestionTemplate.id })
      .from(interviewQuestionTemplate)
      .where(
        and(
          eq(interviewQuestionTemplate.organizationId, organizationId),
          isNull(interviewQuestionTemplate.archivedAt),
          or(
            eq(interviewQuestionTemplate.scope, "global"),
            linkedIds.length ? inArray(interviewQuestionTemplate.id, linkedIds) : undefined,
          ),
        ),
      );
    if (!templates.length) {
      return;
    }
    const ids = templates.map((item) => item.id);
    const [versions, existing] = await Promise.all([
      this.database
        .select()
        .from(interviewQuestionTemplateVersion)
        .where(inArray(interviewQuestionTemplateVersion.templateId, ids))
        .orderBy(desc(interviewQuestionTemplateVersion.version)),
      this.database
        .select()
        .from(interviewQuestionTemplateBinding)
        .where(
          and(
            eq(interviewQuestionTemplateBinding.organizationId, organizationId),
            eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId),
          ),
        ),
    ]);
    const latest = new Map<string, typeof interviewQuestionTemplateVersion.$inferSelect>();
    for (const version of versions) {
      if (!latest.has(version.templateId)) {
        latest.set(version.templateId, version);
      }
    }
    const existingIds = new Set(existing.map((item) => item.templateId));
    const missing = ids.flatMap((templateId, index) => {
      const version = latest.get(templateId);
      return version && !existingIds.has(templateId)
        ? [
            {
              disabledByUser: false,
              id: crypto.randomUUID(),
              interviewRecordId,
              organizationId,
              sortOrder: existing.length + index,
              templateId,
              versionId: version.id,
            },
          ]
        : [];
    });
    if (missing.length) {
      await this.database.insert(interviewQuestionTemplateBinding).values(missing);
    }
  }

  async refreshSnapshot(
    organizationId: string,
    actorId: string,
    roundId: string,
    reason: "create" | "manual_refresh" | "reset",
  ) {
    const current = await this.round(organizationId, roundId);
    await this.ensureBindings(organizationId, current.candidate.id);
    const [jobs, configs, bindingRows, versions] = await Promise.all([
      current.candidate.jobDescriptionId
        ? this.database
            .select({
              id: jobDescription.id,
              name: jobDescription.name,
              prompt: jobDescription.prompt,
            })
            .from(jobDescription)
            .where(eq(jobDescription.id, current.candidate.jobDescriptionId))
            .limit(1)
        : Promise.resolve([]),
      this.database
        .select()
        .from(globalConfig)
        .where(eq(globalConfig.organizationId, organizationId))
        .limit(1),
      this.database
        .select({
          binding: interviewQuestionTemplateBinding,
          scope: interviewQuestionTemplate.scope,
        })
        .from(interviewQuestionTemplateBinding)
        .innerJoin(
          interviewQuestionTemplate,
          eq(interviewQuestionTemplate.id, interviewQuestionTemplateBinding.templateId),
        )
        .where(
          and(
            eq(interviewQuestionTemplateBinding.organizationId, organizationId),
            eq(interviewQuestionTemplateBinding.interviewRecordId, current.candidate.id),
          ),
        )
        .orderBy(asc(interviewQuestionTemplateBinding.sortOrder)),
      this.database
        .select({ value: max(interviewContextSnapshot.version) })
        .from(interviewContextSnapshot)
        .where(eq(interviewContextSnapshot.interviewRecordId, current.candidate.id)),
    ]);
    const versionRows = bindingRows.length
      ? await this.database
          .select()
          .from(interviewQuestionTemplateVersion)
          .where(
            inArray(
              interviewQuestionTemplateVersion.id,
              bindingRows.map((item) => item.binding.versionId),
            ),
          )
      : [];
    const versionById = new Map(versionRows.map((row) => [row.id, row]));
    const linkedForms = current.candidate.jobDescriptionId
      ? await this.database
          .select({ templateId: candidateFormTemplateJobDescription.templateId })
          .from(candidateFormTemplateJobDescription)
          .where(
            eq(
              candidateFormTemplateJobDescription.jobDescriptionId,
              current.candidate.jobDescriptionId,
            ),
          )
      : [];
    const linkedFormIds = linkedForms.map((item) => item.templateId);
    const formTemplates = await this.database
      .select({ id: candidateFormTemplate.id })
      .from(candidateFormTemplate)
      .where(
        and(
          eq(candidateFormTemplate.organizationId, organizationId),
          isNull(candidateFormTemplate.archivedAt),
          or(
            eq(candidateFormTemplate.scope, "global"),
            linkedFormIds.length ? inArray(candidateFormTemplate.id, linkedFormIds) : undefined,
          ),
        ),
      );
    const formVersions = formTemplates.length
      ? await this.database
          .select()
          .from(candidateFormTemplateVersion)
          .where(
            inArray(
              candidateFormTemplateVersion.templateId,
              formTemplates.map((item) => item.id),
            ),
          )
          .orderBy(desc(candidateFormTemplateVersion.version))
      : [];
    const latestForms = new Map<string, typeof candidateFormTemplateVersion.$inferSelect>();
    for (const version of formVersions) {
      if (!latestForms.has(version.templateId)) {
        latestForms.set(version.templateId, version);
      }
    }
    const now = new Date();
    const payload: InterviewContextSnapshotPayload = {
      candidate: {
        candidateEmail: current.candidate.candidateEmail,
        candidateName: current.candidate.candidateName,
        candidatePhone: current.candidate.candidatePhone,
        resumeProfile: current.candidate.resumeProfile,
        targetRole: current.candidate.targetRole,
      },
      createdAt: now.toISOString(),
      forms: [...latestForms.values()].map((version) => ({
        snapshot: version.snapshot,
        templateId: version.templateId,
        version: version.version,
        versionId: version.id,
      })),
      globalConfig: {
        closingInstructions: configs[0]?.closingInstructions ?? null,
        companyContext: configs[0]?.companyContext ?? null,
        openingInstructions: configs[0]?.openingInstructions ?? null,
      },
      interviewRecordId: current.candidate.id,
      interviewers: [],
      jobDescription: jobs[0]
        ? { id: jobs[0].id, name: jobs[0].name, prompt: jobs[0].prompt }
        : null,
      personalizedQuestions: current.candidate.interviewQuestions,
      questionTemplates: bindingRows.flatMap(({ binding, scope }) => {
        const version = versionById.get(binding.versionId);
        return version
          ? [
              {
                bindingId: binding.id,
                disabledByUser: binding.disabledByUser,
                scope,
                snapshot: version.snapshot,
                sortOrder: binding.sortOrder,
                templateId: binding.templateId,
                version: version.version,
                versionId: version.id,
              },
            ]
          : [];
      }),
      scheduleEntryId: roundId,
      schemaVersion: 1,
    };
    const nextVersion = (versions[0]?.value ?? 0) + 1;
    const id = crypto.randomUUID();
    await this.database.transaction(async (tx) => {
      await tx
        .update(interviewContextSnapshot)
        .set({ status: "superseded", supersededAt: now })
        .where(
          and(
            eq(interviewContextSnapshot.interviewRecordId, current.candidate.id),
            eq(interviewContextSnapshot.status, "active"),
          ),
        );
      await tx.insert(interviewContextSnapshot).values({
        contentHash: sha256(JSON.stringify(payload)),
        createdAt: now,
        createdBy: actorId,
        id,
        interviewRecordId: current.candidate.id,
        organizationId,
        payload,
        reason,
        scheduleEntryId: roundId,
        status: "active",
        version: nextVersion,
      });
    });
    return { id, payload, reason, status: "active" as const, version: nextVersion };
  }

  async agentInstructions(organizationId: string, roundId: string) {
    const current = await this.round(organizationId, roundId);
    const snapshots = await this.database
      .select()
      .from(interviewContextSnapshot)
      .where(
        and(
          eq(interviewContextSnapshot.interviewRecordId, current.candidate.id),
          eq(interviewContextSnapshot.status, "active"),
        ),
      )
      .orderBy(desc(interviewContextSnapshot.version))
      .limit(1);
    const [snapshot] = snapshots;
    if (!snapshot) {
      throw new NotFoundException("面试上下文尚未创建，请先发起 AI 面试。");
    }
    const base = [
      snapshot.payload.globalConfig.companyContext,
      snapshot.payload.jobDescription?.prompt,
      ...snapshot.payload.personalizedQuestions.map((question) => question.question),
    ]
      .filter(Boolean)
      .join("\n\n");
    const variants = snapshot.payload.interviewers.length
      ? snapshot.payload.interviewers.map((interviewer) => ({
          closingPrompt: snapshot.payload.globalConfig.closingInstructions ?? "",
          instructions: [base, interviewer.prompt].filter(Boolean).join("\n\n"),
          interviewerName: interviewer.name,
          openingPrompt: snapshot.payload.globalConfig.openingInstructions ?? "",
        }))
      : [
          {
            closingPrompt: snapshot.payload.globalConfig.closingInstructions ?? "",
            instructions: base,
            interviewerName: null,
            openingPrompt: snapshot.payload.globalConfig.openingInstructions ?? "",
          },
        ];
    return { variants };
  }

  async notificationRecipients(organizationId: string, interviewRecordId: string) {
    await this.candidate(organizationId, interviewRecordId);
    const rows = await this.database
      .select({
        email: user.email,
        image: user.image,
        name: user.name,
        providerId: account.providerId,
        userId: user.id,
      })
      .from(studioInterviewNotificationRecipient)
      .innerJoin(user, eq(user.id, studioInterviewNotificationRecipient.userId))
      .leftJoin(
        account,
        and(
          eq(account.userId, user.id),
          inArray(account.providerId, ["feishu", "feishu-jiguang-hr"]),
        ),
      )
      .where(
        and(
          eq(studioInterviewNotificationRecipient.organizationId, organizationId),
          eq(studioInterviewNotificationRecipient.interviewRecordId, interviewRecordId),
        ),
      )
      .orderBy(asc(user.name));
    const records = new Map<
      string,
      {
        email: string;
        feishuBound: boolean;
        feishuProviderIds: string[];
        image: string | null;
        name: string;
        userId: string;
      }
    >();
    for (const row of rows) {
      const entry = records.get(row.userId) ?? {
        email: row.email,
        feishuBound: false,
        feishuProviderIds: [],
        image: row.image,
        name: row.name,
        userId: row.userId,
      };
      if (row.providerId && !entry.feishuProviderIds.includes(row.providerId)) {
        entry.feishuBound = true;
        entry.feishuProviderIds.push(row.providerId);
      }
      records.set(row.userId, entry);
    }
    return { fallbackToInitiator: records.size === 0, records: [...records.values()] };
  }

  async replaceNotificationRecipients(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    input: RecipientInput,
  ) {
    await this.candidate(organizationId, interviewRecordId);
    if (input.userIds.length) {
      const members = await this.database
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(eq(member.organizationId, organizationId), inArray(member.userId, input.userIds)),
        );
      if (members.length !== input.userIds.length) {
        throw new BadRequestException("通知人员必须是当前工作区成员。");
      }
    }
    await this.database.transaction(async (tx) => {
      const previous = await tx
        .select({ userId: studioInterviewNotificationRecipient.userId })
        .from(studioInterviewNotificationRecipient)
        .where(eq(studioInterviewNotificationRecipient.interviewRecordId, interviewRecordId));
      await tx
        .delete(studioInterviewNotificationRecipient)
        .where(eq(studioInterviewNotificationRecipient.interviewRecordId, interviewRecordId));
      if (input.userIds.length) {
        await tx.insert(studioInterviewNotificationRecipient).values(
          input.userIds.map((userId) => ({
            createdBy: actorId,
            interviewRecordId,
            organizationId,
            userId,
          })),
        );
      }
      await tx.insert(interviewAuditLog).values({
        action: "notification_recipients_replaced",
        detail: {
          nextUserIds: input.userIds,
          previousUserIds: previous.map((item) => item.userId),
        },
        id: crypto.randomUUID(),
        interviewRecordId,
        operatorId: actorId,
        organizationId,
      });
    });
    return this.notificationRecipients(organizationId, interviewRecordId);
  }

  async evaluationDocument(organizationId: string, roundId: string) {
    await this.round(organizationId, roundId);
    const conversations = await this.database
      .select()
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.organizationId, organizationId),
          eq(interviewConversation.scheduleEntryId, roundId),
          sql`${interviewConversation.endedAt} is not null`,
        ),
      )
      .orderBy(desc(interviewConversation.endedAt))
      .limit(1);
    const [conversation] = conversations;
    if (!conversation) {
      throw new ConflictException("本轮面试还没有可用于生成评价表的已结束记录。");
    }
    if (conversation.summaryStatus !== "ready") {
      throw new UnprocessableEntityException("面试报告尚未生成完成，请稍后重试。");
    }
    const notifications = await this.database
      .select({ url: interviewNotification.feishuDocumentUrl })
      .from(interviewNotification)
      .where(
        and(
          eq(interviewNotification.organizationId, organizationId),
          eq(interviewNotification.conversationId, conversation.conversationId),
          eq(interviewNotification.type, "summary_ready"),
          sql`${interviewNotification.feishuDocumentUrl} is not null`,
        ),
      )
      .orderBy(desc(interviewNotification.updatedAt))
      .limit(1);
    if (!notifications[0]?.url) {
      throw new UnprocessableEntityException("评价表尚未生成，请确认创建人已绑定飞书账号后重试。");
    }
    return { conversationId: conversation.conversationId, feishuDocumentUrl: notifications[0].url };
  }

  private async humanRound(organizationId: string, roundId: string, recordId?: string) {
    const rows = await this.database
      .select()
      .from(studioHumanInterviewRound)
      .where(
        and(
          eq(studioHumanInterviewRound.id, roundId),
          eq(studioHumanInterviewRound.organizationId, organizationId),
          recordId ? eq(studioHumanInterviewRound.interviewRecordId, recordId) : undefined,
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("真人复面轮次不存在。");
    }
    return rows[0];
  }

  private async serializeHumanRound(row: typeof studioHumanInterviewRound.$inferSelect) {
    const interviewers = await this.database
      .select({
        confirmedAt: studioHumanInterviewRoundInterviewer.confirmedAt,
        declineReason: studioHumanInterviewRoundInterviewer.declineReason,
        declinedAt: studioHumanInterviewRoundInterviewer.declinedAt,
        image: user.image,
        name: user.name,
        status: studioHumanInterviewRoundInterviewer.status,
        userId: user.id,
      })
      .from(studioHumanInterviewRoundInterviewer)
      .innerJoin(user, eq(user.id, studioHumanInterviewRoundInterviewer.userId))
      .where(eq(studioHumanInterviewRoundInterviewer.roundId, row.id))
      .orderBy(asc(user.name));
    return serialize({ ...row, interviewers });
  }

  async humanRounds(organizationId: string, interviewRecordId: string) {
    await this.candidate(organizationId, interviewRecordId);
    const rows = await this.database
      .select()
      .from(studioHumanInterviewRound)
      .where(
        and(
          eq(studioHumanInterviewRound.organizationId, organizationId),
          eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
        ),
      )
      .orderBy(asc(studioHumanInterviewRound.sortOrder), asc(studioHumanInterviewRound.createdAt));
    return Promise.all(rows.map((row) => this.serializeHumanRound(row)));
  }

  async createHumanRound(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    input: HumanInterviewRoundInput,
  ) {
    const candidate = await this.candidate(organizationId, interviewRecordId);
    if (candidate.pipelineStage === "closed") {
      throw new BadRequestException("已结束的候选人请先重新激活。");
    }
    if (candidate.pipelineStage === "offer") {
      throw new BadRequestException("候选人已进入 Offer 阶段，不能再创建真人面试轮次。");
    }
    if (input.interviewerIds.length) {
      const valid = await this.database
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            inArray(member.userId, input.interviewerIds),
          ),
        );
      if (valid.length !== new Set(input.interviewerIds).size) {
        throw new BadRequestException("面试官必须是当前工作区成员。");
      }
    }
    const orderRows = await this.database
      .select({ value: max(studioHumanInterviewRound.sortOrder) })
      .from(studioHumanInterviewRound)
      .where(eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId));
    const id = crypto.randomUUID();
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx.insert(studioHumanInterviewRound).values({
        feedback: input.feedback ?? null,
        format: "online",
        id,
        interviewRecordId,
        label: input.label,
        location: null,
        meetingUrl: null,
        notes: input.notes ?? null,
        organizationId,
        outcome: input.outcome ?? null,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        score: input.score ?? null,
        sortOrder: input.sortOrder ?? (orderRows[0]?.value ?? -1) + 1,
        status: "pending",
      });
      if (input.interviewerIds.length) {
        await tx.insert(studioHumanInterviewRoundInterviewer).values(
          [...new Set(input.interviewerIds)].map((userId) => ({
            roundId: id,
            status: "pending" as const,
            userId,
          })),
        );
      }
      await tx
        .update(studioInterview)
        .set({ pipelineStage: "human_interview", updatedAt: now })
        .where(
          and(
            eq(studioInterview.id, interviewRecordId),
            inArray(studioInterview.pipelineStage, ["screening", "written_test", "ai_interview"]),
          ),
        );
      await tx.insert(interviewAuditLog).values({
        action: "human_interview_round_created",
        detail: { roundId: id, roundLabel: input.label, scheduledAt: input.scheduledAt ?? null },
        id: crypto.randomUUID(),
        interviewRecordId,
        operatorId: actorId,
        organizationId,
      });
    });
    return this.serializeHumanRound(await this.humanRound(organizationId, id));
  }

  async updateHumanRound(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    roundId: string,
    input: Partial<HumanInterviewRoundInput> & { validUntil?: string | null },
  ) {
    const current = await this.humanRound(organizationId, roundId, interviewRecordId);
    if (current.status !== "pending") {
      throw new ConflictException("已完成或已取消的真人复面轮次不能编辑。");
    }
    if (input.interviewerIds) {
      const unique = [...new Set(input.interviewerIds)];
      const valid = unique.length
        ? await this.database
            .select({ userId: member.userId })
            .from(member)
            .where(and(eq(member.organizationId, organizationId), inArray(member.userId, unique)))
        : [];
      if (valid.length !== unique.length) {
        throw new BadRequestException("面试官必须是当前工作区成员。");
      }
      await this.database.transaction(async (tx) => {
        await tx
          .delete(studioHumanInterviewRoundInterviewer)
          .where(eq(studioHumanInterviewRoundInterviewer.roundId, roundId));
        if (unique.length) {
          await tx
            .insert(studioHumanInterviewRoundInterviewer)
            .values(unique.map((userId) => ({ roundId, status: "pending" as const, userId })));
        }
      });
    }
    await this.database
      .update(studioHumanInterviewRound)
      .set({
        feedback: input.feedback,
        format: input.format,
        label: input.label,
        notes: input.notes,
        outcome: input.outcome,
        scheduledAt: optionalDate(input.scheduledAt),
        score: input.score,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(studioHumanInterviewRound.id, roundId));
    await this.audit({
      action: "human_interview_round_updated",
      actorId,
      detail: { roundId },
      interviewRecordId,
      organizationId,
    });
    return this.serializeHumanRound(await this.humanRound(organizationId, roundId));
  }

  async completeHumanRound(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    roundId: string,
    input: CompleteRoundInput,
  ) {
    const current = await this.humanRound(organizationId, roundId, interviewRecordId);
    if (current.status !== "pending") {
      throw new ConflictException("该真人复面轮次已经结束。");
    }
    const updated = await this.database
      .update(studioHumanInterviewRound)
      .set({
        completedAt: new Date(),
        feedback: input.feedback,
        outcome: input.outcome,
        score: input.score ?? null,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioHumanInterviewRound.id, roundId),
          eq(studioHumanInterviewRound.status, "pending"),
        ),
      )
      .returning();
    if (!updated[0]) {
      throw new ConflictException("该真人复面轮次已经结束。");
    }
    await this.audit({
      action: "human_interview_round_completed",
      actorId,
      detail: { outcome: input.outcome, roundId, score: input.score ?? null },
      interviewRecordId,
      organizationId,
    });
    return this.serializeHumanRound(updated[0]);
  }

  async cancelHumanRound(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    roundId: string,
    reason?: string | null,
  ) {
    const current = await this.humanRound(organizationId, roundId, interviewRecordId);
    if (current.status !== "pending") {
      throw new ConflictException("该真人复面轮次已经结束。");
    }
    const now = new Date();
    const updated = await this.database
      .update(studioHumanInterviewRound)
      .set({ cancelReason: reason ?? null, cancelledAt: now, status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(studioHumanInterviewRound.id, roundId),
          eq(studioHumanInterviewRound.status, "pending"),
        ),
      )
      .returning();
    await this.database
      .update(studioHumanInterviewMeeting)
      .set({
        cancelledAt: now,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "cancelled",
        updatedAt: now,
      })
      .where(
        inArray(
          studioHumanInterviewMeeting.id,
          this.database
            .select({ id: studioHumanInterviewMeetingRound.meetingId })
            .from(studioHumanInterviewMeetingRound)
            .where(eq(studioHumanInterviewMeetingRound.roundId, roundId)),
        ),
      );
    await this.audit({
      action: "human_interview_round_cancelled",
      actorId,
      detail: { reason: reason ?? null, roundId },
      interviewRecordId,
      organizationId,
    });
    return this.serializeHumanRound(updated[0]);
  }

  private async offer(organizationId: string, interviewRecordId: string, draftId: string) {
    const rows = await this.database
      .select()
      .from(studioOfferDraft)
      .where(
        and(
          eq(studioOfferDraft.id, draftId),
          eq(studioOfferDraft.organizationId, organizationId),
          eq(studioOfferDraft.interviewRecordId, interviewRecordId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("Offer 不存在。");
    }
    return rows[0];
  }

  async offers(organizationId: string, interviewRecordId: string) {
    await this.candidate(organizationId, interviewRecordId);
    return serialize(
      await this.database
        .select()
        .from(studioOfferDraft)
        .where(
          and(
            eq(studioOfferDraft.organizationId, organizationId),
            eq(studioOfferDraft.interviewRecordId, interviewRecordId),
          ),
        )
        .orderBy(desc(studioOfferDraft.version)),
    );
  }

  async createOffer(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    input: CreateOfferInput,
  ) {
    const candidate = await this.candidate(organizationId, interviewRecordId);
    if (candidate.pipelineStage === "closed") {
      throw new BadRequestException("已结束的候选人请先重新激活。");
    }
    if (!["human_interview", "offer"].includes(candidate.pipelineStage)) {
      throw new BadRequestException("候选人需先进入真人复面阶段，才能创建 Offer。");
    }
    if (candidate.pipelineStage === "human_interview") {
      const rounds = await this.database
        .select()
        .from(studioHumanInterviewRound)
        .where(
          and(
            eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
            eq(studioHumanInterviewRound.organizationId, organizationId),
          ),
        );
      const active = rounds.filter((round) => round.status !== "cancelled");
      if (
        !active.length ||
        active.some((round) => round.status !== "completed" || !round.feedback?.trim())
      ) {
        throw new BadRequestException("请先完成所有真人面试轮次，并补全每轮面试评价。");
      }
    }
    const versions = await this.database
      .select({ value: max(studioOfferDraft.version) })
      .from(studioOfferDraft)
      .where(eq(studioOfferDraft.interviewRecordId, interviewRecordId));
    const id = crypto.randomUUID();
    const now = new Date();
    const status = input.sendImmediately ? "sent" : "draft";
    const rows = await this.database.transaction(async (tx) => {
      if (input.sendImmediately) {
        await tx
          .update(studioOfferDraft)
          .set({ status: "superseded", updatedAt: now })
          .where(
            and(
              eq(studioOfferDraft.interviewRecordId, interviewRecordId),
              inArray(studioOfferDraft.status, ["draft", "sent"]),
            ),
          );
      }
      const created = await tx
        .insert(studioOfferDraft)
        .values({
          baseSalary: input.baseSalary,
          bonus: input.bonus ?? null,
          candidateCounter: input.candidateCounter ?? null,
          currency: input.currency ?? "CNY",
          equity: input.equity ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          id,
          interviewRecordId,
          joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
          notes: input.notes ?? null,
          organizationId,
          position: input.position,
          sentAt: input.sendImmediately ? now : null,
          status,
          version: (versions[0]?.value ?? 0) + 1,
        })
        .returning();
      await tx
        .update(studioInterview)
        .set({ pipelineStage: "offer", updatedAt: now })
        .where(eq(studioInterview.id, interviewRecordId));
      return created;
    });
    await this.audit({
      action: "offer_draft_created",
      actorId,
      detail: {
        draftId: id,
        sentImmediately: Boolean(input.sendImmediately),
        version: rows[0].version,
      },
      interviewRecordId,
      organizationId,
    });
    return serialize(rows[0]);
  }

  async updateOffer(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    draftId: string,
    input: Partial<OfferDraftInput>,
  ) {
    const current = await this.offer(organizationId, interviewRecordId, draftId);
    if (current.status !== "draft") {
      throw new ConflictException("只有草稿状态的 Offer 可以编辑。");
    }
    const rows = await this.database
      .update(studioOfferDraft)
      .set({
        baseSalary: input.baseSalary,
        bonus: input.bonus,
        candidateCounter: input.candidateCounter,
        currency: input.currency,
        equity: input.equity,
        expiresAt: optionalDate(input.expiresAt),
        joiningDate: optionalDate(input.joiningDate),
        notes: input.notes,
        position: input.position,
        updatedAt: new Date(),
      })
      .where(eq(studioOfferDraft.id, draftId))
      .returning();
    await this.audit({
      action: "offer_draft_updated",
      actorId,
      detail: { draftId },
      interviewRecordId,
      organizationId,
    });
    return serialize(rows[0]);
  }

  async sendOffer(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    draftId: string,
  ) {
    const current = await this.offer(organizationId, interviewRecordId, draftId);
    if (current.status !== "draft") {
      throw new ConflictException("只有草稿状态的 Offer 可以发送。");
    }
    const now = new Date();
    const rows = await this.database.transaction(async (tx) => {
      await tx
        .update(studioOfferDraft)
        .set({ status: "superseded", updatedAt: now })
        .where(
          and(
            eq(studioOfferDraft.interviewRecordId, interviewRecordId),
            eq(studioOfferDraft.status, "sent"),
          ),
        );
      return tx
        .update(studioOfferDraft)
        .set({ sentAt: now, status: "sent", updatedAt: now })
        .where(eq(studioOfferDraft.id, draftId))
        .returning();
    });
    await this.audit({
      action: "offer_draft_sent",
      actorId,
      detail: { draftId },
      interviewRecordId,
      organizationId,
    });
    return serialize(rows[0]);
  }

  async respondOffer(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    draftId: string,
    input: OfferResponseInput,
  ) {
    const current = await this.offer(organizationId, interviewRecordId, draftId);
    if (current.status !== "sent") {
      throw new ConflictException("只有已发送的 Offer 可以录入回复。");
    }
    const responseStatuses = {
      accepted: "accepted",
      counter: "sent",
      declined: "declined",
    } as const;
    const status = responseStatuses[input.response];
    const rows = await this.database
      .update(studioOfferDraft)
      .set({
        candidateCounter: input.candidateCounter ?? current.candidateCounter,
        responseAt: new Date(),
        status,
        updatedAt: new Date(),
      })
      .where(eq(studioOfferDraft.id, draftId))
      .returning();
    if (status === "accepted") {
      await this.database
        .update(studioInterview)
        .set({
          closedAt: new Date(),
          closedMeta: { previousStage: "offer" },
          outcome: "hired",
          pipelineStage: "closed",
          updatedAt: new Date(),
        })
        .where(eq(studioInterview.id, interviewRecordId));
    }
    await this.audit({
      action: "offer_response_recorded",
      actorId,
      detail: { draftId, response: input.response },
      interviewRecordId,
      organizationId,
    });
    return serialize(rows[0]);
  }

  async cancelOffer(
    organizationId: string,
    actorId: string,
    interviewRecordId: string,
    draftId: string,
  ) {
    const current = await this.offer(organizationId, interviewRecordId, draftId);
    if (["accepted", "declined", "expired", "superseded"].includes(current.status)) {
      throw new ConflictException("该 Offer 已结束，不能取消。");
    }
    const rows = await this.database
      .update(studioOfferDraft)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(eq(studioOfferDraft.id, draftId))
      .returning();
    await this.audit({
      action: "offer_draft_cancelled",
      actorId,
      detail: { draftId },
      interviewRecordId,
      organizationId,
    });
    return serialize(rows[0]);
  }

  private async meeting(organizationId: string, meetingId: string) {
    const rows = await this.database
      .select()
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("真人复面会议不存在。");
    }
    return rows[0];
  }

  private async meetingDetail(organizationId: string, meetingId: string) {
    const meeting = await this.meeting(organizationId, meetingId);
    const [rounds, interviewers] = await Promise.all([
      this.database
        .select({
          candidateEmail: studioInterview.candidateEmail,
          candidateName: studioInterview.candidateName,
          interviewRecordId: studioHumanInterviewRound.interviewRecordId,
          label: studioHumanInterviewRound.label,
          roundId: studioHumanInterviewRound.id,
          status: studioHumanInterviewRound.status,
        })
        .from(studioHumanInterviewMeetingRound)
        .innerJoin(
          studioHumanInterviewRound,
          eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
        )
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId),
        )
        .where(eq(studioHumanInterviewMeetingRound.meetingId, meetingId)),
      this.database
        .select({
          image: user.image,
          name: user.name,
          role: studioHumanInterviewMeetingInterviewer.role,
          userId: user.id,
        })
        .from(studioHumanInterviewMeetingInterviewer)
        .innerJoin(user, eq(user.id, studioHumanInterviewMeetingInterviewer.userId))
        .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId)),
    ]);
    return serialize({ ...meeting, interviewers, rounds });
  }

  async meetings(organizationId: string, query: z.infer<typeof meetingListQuerySchema>) {
    const rows = await this.database
      .select()
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
          query.status
            ? inArray(studioHumanInterviewMeeting.status, query.status.split(",") as never[])
            : undefined,
          query.from
            ? gte(studioHumanInterviewMeeting.scheduledAt, new Date(query.from))
            : undefined,
          query.to ? lte(studioHumanInterviewMeeting.scheduledAt, new Date(query.to)) : undefined,
        ),
      )
      .orderBy(
        desc(studioHumanInterviewMeeting.scheduledAt),
        desc(studioHumanInterviewMeeting.createdAt),
      );
    return Promise.all(rows.map((row) => this.meetingDetail(organizationId, row.id)));
  }

  getMeeting(organizationId: string, meetingId: string) {
    return this.meetingDetail(organizationId, meetingId);
  }

  async createMeeting(organizationId: string, actorId: string, input: HumanInterviewMeetingInput) {
    const uniqueRoundIds = [...new Set(input.roundIds)];
    const rounds = await this.database
      .select({ id: studioHumanInterviewRound.id, status: studioHumanInterviewRound.status })
      .from(studioHumanInterviewRound)
      .where(
        and(
          eq(studioHumanInterviewRound.organizationId, organizationId),
          inArray(studioHumanInterviewRound.id, uniqueRoundIds),
        ),
      );
    if (rounds.length !== uniqueRoundIds.length) {
      throw new BadRequestException("真人复面轮次不存在或不属于当前工作区。");
    }
    if (rounds.some((round) => round.status !== "pending")) {
      throw new ConflictException("只有待进行的真人复面轮次可以加入会议。");
    }
    const occupied = await this.database
      .select({ roundId: studioHumanInterviewMeetingRound.roundId })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
      )
      .where(
        and(
          inArray(studioHumanInterviewMeetingRound.roundId, uniqueRoundIds),
          inArray(studioHumanInterviewMeeting.status, ["scheduled", "in_progress"]),
        ),
      );
    if (occupied.length) {
      throw new ConflictException("存在已经加入其他有效会议的真人复面轮次。");
    }
    const assignments = await this.database
      .select({ userId: studioHumanInterviewRoundInterviewer.userId })
      .from(studioHumanInterviewRoundInterviewer)
      .where(inArray(studioHumanInterviewRoundInterviewer.roundId, uniqueRoundIds));
    const interviewerIds = [...new Set(assignments.map((item) => item.userId))];
    const id = crypto.randomUUID();
    await this.database.transaction(async (tx) => {
      await tx.insert(studioHumanInterviewMeeting).values({
        createdBy: actorId,
        id,
        liveKitRoomName: `human-${organizationId}-${id}`,
        notes: input.notes ?? null,
        organizationId,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: "scheduled",
        title: input.title,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      });
      await tx
        .insert(studioHumanInterviewMeetingRound)
        .values(uniqueRoundIds.map((roundId) => ({ meetingId: id, roundId })));
      if (interviewerIds.length) {
        await tx.insert(studioHumanInterviewMeetingInterviewer).values(
          interviewerIds.map((userId, index) => ({
            meetingId: id,
            role: index === 0 ? ("host" as const) : ("interviewer" as const),
            userId,
          })),
        );
      }
    });
    return this.meetingDetail(organizationId, id);
  }

  async updateMeeting(
    organizationId: string,
    actorId: string,
    meetingId: string,
    input: HumanInterviewMeetingScheduleUpdate,
  ) {
    const meeting = await this.meeting(organizationId, meetingId);
    if (meeting.status !== "scheduled") {
      throw new ConflictException("只有未开始的会议可以改期。");
    }
    const scheduledAt = new Date(input.scheduledAt);
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && validUntil <= scheduledAt) {
      throw new BadRequestException("有效期必须晚于会议时间。");
    }
    const rows = await this.database
      .update(studioHumanInterviewMeeting)
      .set({
        feishuSyncStatus: meeting.feishuMeetingId ? "pending" : meeting.feishuSyncStatus,
        scheduleVersion: meeting.scheduleVersion + 1,
        scheduledAt,
        updatedAt: new Date(),
        validUntil,
      })
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, meetingId),
          eq(studioHumanInterviewMeeting.scheduleVersion, meeting.scheduleVersion),
        ),
      )
      .returning();
    if (!rows[0]) {
      throw new ConflictException("会议已被其他操作更新，请刷新后重试。");
    }
    return this.meetingDetail(organizationId, meetingId);
  }

  async syncMeetingToFeishu(organizationId: string, meetingId: string) {
    const meeting = await this.meeting(organizationId, meetingId);
    if (meeting.status !== "scheduled") {
      throw new ConflictException("只有未开始的会议可以同步到飞书。");
    }
    if (!meeting.scheduledAt) {
      throw new BadRequestException("请先设置会议时间。");
    }
    const appId = requiredEnvironment("FEISHU_APP_ID");
    const appSecret = requiredEnvironment("FEISHU_APP_SECRET");
    await this.database
      .update(studioHumanInterviewMeeting)
      .set({ feishuLastError: null, feishuSyncStatus: "creating", updatedAt: new Date() })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    try {
      const token = await getFeishuTenantAccessToken(appId, appSecret);
      const end = meeting.validUntil ?? new Date(meeting.scheduledAt.getTime() + 60 * 60 * 1000);
      const response = await fetch(
        "https://open.feishu.cn/open-apis/calendar/v4/calendars/primary/events",
        {
          body: JSON.stringify({
            description: meeting.notes ?? "",
            end_time: {
              timestamp: String(Math.floor(end.getTime() / 1000)),
              timezone: "Asia/Shanghai",
            },
            need_notification: true,
            start_time: {
              timestamp: String(Math.floor(meeting.scheduledAt.getTime() / 1000)),
              timezone: "Asia/Shanghai",
            },
            summary: meeting.title,
          }),
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as {
        code?: number;
        data?: { event?: { app_link?: string; event_id?: string; html_link?: string } };
        msg?: string;
      };
      if (!response.ok || payload.code !== 0) {
        throw new Error(payload.msg ?? `Feishu HTTP ${response.status}`);
      }
      const event = payload.data?.event;
      await this.database
        .update(studioHumanInterviewMeeting)
        .set({
          feishuAppLink: event?.app_link ?? null,
          feishuCalendarEventId: event?.event_id ?? null,
          feishuCalendarEventUrl: event?.html_link ?? null,
          feishuLastError: null,
          feishuProviderId: "feishu",
          feishuSyncStatus: "ready",
          feishuSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(studioHumanInterviewMeeting.id, meetingId));
      return this.meetingDetail(organizationId, meetingId);
    } catch (error) {
      await this.database
        .update(studioHumanInterviewMeeting)
        .set({
          feishuLastError: error instanceof Error ? error.message : String(error),
          feishuSyncStatus: "failed",
          updatedAt: new Date(),
        })
        .where(eq(studioHumanInterviewMeeting.id, meetingId));
      throw new BadGatewayException("同步飞书会议失败。", { cause: error });
    }
  }

  async issueMeetingLinks(organizationId: string, meetingId: string) {
    const meeting = await this.meeting(organizationId, meetingId);
    if (!["scheduled", "in_progress"].includes(meeting.status)) {
      throw new ConflictException("会议已经结束，不能重新生成链接。");
    }
    const roundRows = await this.database
      .select()
      .from(studioHumanInterviewMeetingRound)
      .where(eq(studioHumanInterviewMeetingRound.meetingId, meetingId));
    const links: { inviteToken: string; roundId: string }[] = [];
    await this.database.transaction(async (tx) => {
      for (const row of roundRows) {
        const token = randomBytes(32).toString("base64url");
        links.push({ inviteToken: token, roundId: row.roundId });
        await tx
          .update(studioHumanInterviewMeetingRound)
          .set({
            candidateInviteStatus: "sent",
            candidateInviteTokenHash: sha256(token),
            invitationVersion: row.invitationVersion + 1,
          })
          .where(
            and(
              eq(studioHumanInterviewMeetingRound.meetingId, meetingId),
              eq(studioHumanInterviewMeetingRound.roundId, row.roundId),
            ),
          );
      }
    });
    return {
      candidates: links.map((item) => ({
        ...item,
        url: `${rawBackendEnvironment.BETTER_AUTH_URL ?? "http://localhost:3000"}/human-interview/${item.inviteToken}`,
      })),
      meetingId,
    };
  }

  async meetingLiveKitToken(
    organizationId: string,
    actorId: string,
    meetingId: string,
    interviewerId?: string,
  ) {
    const meeting = await this.meeting(organizationId, meetingId);
    if (meeting.status === "cancelled" || meeting.status === "ended") {
      throw new ConflictException("会议已经结束。");
    }
    if (meeting.validUntil && meeting.validUntil < new Date()) {
      throw new ConflictException("会议链接已经过期。");
    }
    const effectiveId = interviewerId ?? actorId;
    const assignment = await this.database
      .select({ role: studioHumanInterviewMeetingInterviewer.role })
      .from(studioHumanInterviewMeetingInterviewer)
      .where(
        and(
          eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId),
          eq(studioHumanInterviewMeetingInterviewer.userId, effectiveId),
        ),
      )
      .limit(1);
    if (!assignment[0]) {
      throw new ForbiddenException("你不是本场会议的面试官。");
    }
    const roomName = meeting.liveKitRoomName ?? `human-${organizationId}-${meetingId}`;
    if (!meeting.liveKitRoomName) {
      await this.database
        .update(studioHumanInterviewMeeting)
        .set({ liveKitRoomName: roomName })
        .where(eq(studioHumanInterviewMeeting.id, meetingId));
    }
    const token = new AccessToken(
      requiredEnvironment("LIVEKIT_API_KEY"),
      requiredEnvironment("LIVEKIT_API_SECRET"),
      { identity: `interviewer:${effectiveId}`, name: effectiveId, ttl: "2h" },
    );
    token.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: roomName,
      roomJoin: true,
      roomRecord: assignment[0].role === "host",
    });
    return { token: await token.toJwt(), url: requiredEnvironment("LIVEKIT_URL") };
  }

  async endMeeting(organizationId: string, meetingId: string) {
    const meeting = await this.meeting(organizationId, meetingId);
    if (meeting.status === "ended") {
      return this.meetingDetail(organizationId, meetingId);
    }
    if (meeting.status === "cancelled") {
      throw new ConflictException("已取消的会议不能结束。");
    }
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
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    if (
      meeting.liveKitRoomName &&
      rawBackendEnvironment.LIVEKIT_API_KEY &&
      rawBackendEnvironment.LIVEKIT_API_SECRET &&
      rawBackendEnvironment.LIVEKIT_URL
    ) {
      await new RoomServiceClient(
        rawBackendEnvironment.LIVEKIT_URL,
        rawBackendEnvironment.LIVEKIT_API_KEY,
        rawBackendEnvironment.LIVEKIT_API_SECRET,
      )
        .deleteRoom(meeting.liveKitRoomName)
        .catch(() => null);
    }
    return this.meetingDetail(organizationId, meetingId);
  }

  async cancelMeeting(organizationId: string, meetingId: string) {
    const meeting = await this.meeting(organizationId, meetingId);
    if (!["scheduled", "in_progress"].includes(meeting.status)) {
      throw new ConflictException("会议已经结束。");
    }
    const now = new Date();
    await this.database
      .update(studioHumanInterviewMeeting)
      .set({
        cancelledAt: now,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "cancelled",
        updatedAt: now,
      })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    if (
      meeting.liveKitRoomName &&
      rawBackendEnvironment.LIVEKIT_API_KEY &&
      rawBackendEnvironment.LIVEKIT_API_SECRET &&
      rawBackendEnvironment.LIVEKIT_URL
    ) {
      await new RoomServiceClient(
        rawBackendEnvironment.LIVEKIT_URL,
        rawBackendEnvironment.LIVEKIT_API_KEY,
        rawBackendEnvironment.LIVEKIT_API_SECRET,
      )
        .deleteRoom(meeting.liveKitRoomName)
        .catch(() => null);
    }
    return this.meetingDetail(organizationId, meetingId);
  }

  async sendRoundEmail(organizationId: string, actorId: string, roundId: string) {
    const current = await this.round(organizationId, roundId);
    if (!current.candidate.candidateEmail) {
      throw new BadRequestException("候选人未填写邮箱。");
    }
    if (current.round.status !== "pending") {
      throw new ConflictException("只能发送待开始轮次的邀请邮件。");
    }
    const apiKey = requiredEnvironment("RESEND_API_KEY");
    const from = requiredEnvironment("RESEND_FROM");
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const url = `${rawBackendEnvironment.BETTER_AUTH_URL ?? "http://localhost:3000"}/interview/${token}`;
    await this.database
      .update(studioInterviewSchedule)
      .set({
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: sha256(token),
        invitationVersion: current.round.invitationVersion + 1,
        updatedAt: now,
      })
      .where(eq(studioInterviewSchedule.id, roundId));
    const subject = `${current.candidate.candidateName}，邀请你参加 ${current.round.roundLabel}`;
    const result = await new Resend(apiKey).emails.send({
      from,
      html: `<p>${current.candidate.candidateName}，你好：</p><p>请通过以下链接参加 ${current.round.roundLabel}：</p><p><a href="${url}">${url}</a></p>`,
      subject,
      to: current.candidate.candidateEmail,
    });
    const error = result.error?.message ?? null;
    await this.database.insert(studioRoundEmailLog).values({
      errorMessage: error,
      id: crypto.randomUUID(),
      interviewRecordId: current.candidate.id,
      organizationId,
      resendMessageId: result.data?.id ?? null,
      roundId,
      sentBy: actorId,
      status: error ? "failed" : "sent",
      subject,
      toEmail: current.candidate.candidateEmail,
    });
    if (error) {
      throw new BadGatewayException("发送面试邀请邮件失败。");
    }
    if (!result.data) {
      throw new BadGatewayException("发送服务未返回邮件标识。");
    }
    return {
      messageId: result.data.id,
      roundId,
      sentAt: now.toISOString(),
      to: current.candidate.candidateEmail,
    };
  }

  async roundEmailSummary(organizationId: string, roundIds?: string) {
    const ids = roundIds
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const rows = await this.database
      .select({
        failed: sql<number>`count(*) filter (where ${studioRoundEmailLog.status} = 'failed')`,
        lastSentAt: max(studioRoundEmailLog.createdAt),
        roundId: studioRoundEmailLog.roundId,
        sent: sql<number>`count(*) filter (where ${studioRoundEmailLog.status} = 'sent')`,
      })
      .from(studioRoundEmailLog)
      .where(
        and(
          eq(studioRoundEmailLog.organizationId, organizationId),
          ids?.length ? inArray(studioRoundEmailLog.roundId, ids) : undefined,
        ),
      )
      .groupBy(studioRoundEmailLog.roundId);
    return {
      records: serialize(
        rows.map((row) => ({
          ...row,
          failed: Number(row.failed),
          sent: Number(row.sent),
        })),
      ),
    };
  }
}
