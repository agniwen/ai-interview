import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { buildCandidateFormAnswersSchema } from "@arc/db-schema/candidate-forms";
import {
  candidateFormSubmission,
  globalConfig,
  interviewContextSnapshot,
  interviewConversation,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import {
  buildCandidateInterviewView,
  pickCurrentScheduleEntry,
  sortScheduleEntries,
} from "@arc/shared/interview/interview-record";
import {
  buildInterviewDispatchMetadata,
  selectInterviewDispatchInterviewer,
} from "@arc/shared/interview/dispatch-contract";
import { resolveInterviewRecordingEnabled } from "@arc/shared/interview/recording-config";
import { INTERVIEW_END_REASON } from "@arc/shared/interview/end-reason";
import { AGENT_JOBS_PORT } from "../agent/agent.port.js";
import type { AgentJobsPort } from "../agent/agent.port.js";
import { HTTP_DATABASE } from "../../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../../infrastructure/http/http.ports.js";
import type { CandidateInterviewPort } from "./interview.port.js";
import type {
  candidateInterviewFeedbackInputSchema,
  interviewFormSubmissionSchema,
} from "./interview.schemas.js";
import type { z } from "zod";

@Injectable()
export class InterviewService implements CandidateInterviewPort {
  constructor(
    @Inject(HTTP_DATABASE)
    private readonly database: HttpDatabase,
    @Inject(AGENT_JOBS_PORT)
    private readonly jobs: AgentJobsPort,
  ) {}

  async resolve(input: { interviewId: string }) {
    const record = await this.loadRecord(input.interviewId);
    const entries = await this.database
      .select()
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.interviewRecordId, record.id));
    const active = pickCurrentScheduleEntry(sortScheduleEntries(entries));
    if (!active) {
      throw new NotFoundException("Interview not available", {
        errorCode: "CANDIDATE_INTERVIEW_NOT_AVAILABLE",
      });
    }
    return { interviewId: record.id, roundId: active.id };
  }

  async getInterview(input: { interviewId: string; roundId: string }) {
    const { record, snapshot, view } = await this.loadView(input);
    await this.ensureInvitationAccess(input.roundId);
    const [config] = await this.database
      .select({ companyContext: globalConfig.companyContext })
      .from(globalConfig)
      .where(eq(globalConfig.organizationId, record.organizationId))
      .limit(1);
    return {
      ...view,
      companyContext:
        config?.companyContext?.trim() || snapshot.globalConfig.companyContext?.trim() || null,
      interviewQuestions: snapshot.personalizedQuestions,
      interviewers: snapshot.interviewers,
      jobDescriptionDescription: null,
      jobDescriptionName: snapshot.jobDescription?.name ?? null,
      jobDescriptionPresetQuestions: this.presetQuestions(snapshot),
      jobDescriptionPrompt: snapshot.jobDescription?.prompt ?? null,
      organizationId: record.organizationId,
    };
  }

  async getForms(input: { interviewId: string; roundId: string }) {
    await this.loadView(input);
    const snapshot = await this.loadSnapshot(input.interviewId);
    const required = snapshot.forms.map((form) => ({
      snapshot: form.snapshot,
      templateId: form.templateId,
      version: form.version,
      versionId: form.versionId,
    }));
    if (required.length === 0) {
      return { required: [], submitted: {} };
    }
    const rows = await this.database
      .select({ templateId: candidateFormSubmission.templateId })
      .from(candidateFormSubmission)
      .where(
        and(
          eq(candidateFormSubmission.interviewRecordId, input.interviewId),
          inArray(
            candidateFormSubmission.templateId,
            required.map((form) => form.templateId),
          ),
        ),
      );
    return {
      required,
      submitted: Object.fromEntries(rows.map((row) => [row.templateId, true] as const)),
    };
  }

  async submitForm(input: {
    body: z.infer<typeof interviewFormSubmissionSchema>;
    interviewId: string;
    roundId: string;
    templateId: string;
  }) {
    const { record, view } = await this.loadView(input);
    if (view.currentRoundStatus === "completed") {
      throw new ForbiddenException("Interview round is completed", {
        errorCode: "INTERVIEW_ROUND_COMPLETED",
      });
    }
    const snapshot = await this.loadSnapshot(input.interviewId);
    const form = snapshot.forms.find((candidate) => candidate.templateId === input.templateId);
    if (!form) {
      throw new BadRequestException("Form is not applicable to this interview", {
        errorCode: "INTERVIEW_FORM_NOT_APPLICABLE",
      });
    }
    if (form.versionId !== input.body.versionId) {
      throw new ConflictException("Interview form version is stale", {
        errorCode: "INTERVIEW_FORM_VERSION_STALE",
      });
    }
    const answers = buildCandidateFormAnswersSchema(form.snapshot).safeParse(input.body.answers);
    if (!answers.success) {
      throw new BadRequestException(
        answers.error.issues[0]?.message ?? "Interview form is incomplete",
        { errorCode: "INTERVIEW_FORM_INVALID" },
      );
    }
    const submissionId = crypto.randomUUID();
    try {
      await this.database.insert(candidateFormSubmission).values({
        answers: answers.data,
        id: submissionId,
        interviewRecordId: input.interviewId,
        organizationId: record.organizationId,
        submittedAt: new Date(),
        templateId: input.templateId,
        versionId: form.versionId,
      });
    } catch {
      throw new ConflictException("Interview form has already been submitted", {
        errorCode: "INTERVIEW_FORM_ALREADY_SUBMITTED",
      });
    }
    return {
      submissionId,
      success: true,
      version: form.version,
      versionId: form.versionId,
    };
  }

  async submitFeedback(input: {
    feedback: z.infer<typeof candidateInterviewFeedbackInputSchema>;
    interviewId: string;
    roundId: string;
  }) {
    const submittedAt = new Date();
    const [updated] = await this.database
      .update(studioInterviewSchedule)
      .set({
        candidateFeedbackCategories: input.feedback.categories,
        candidateFeedbackDetail: input.feedback.detail,
        candidateFeedbackSubmittedAt: submittedAt,
        updatedAt: submittedAt,
      })
      .where(
        and(
          eq(studioInterviewSchedule.id, input.roundId),
          eq(studioInterviewSchedule.interviewRecordId, input.interviewId),
          eq(studioInterviewSchedule.status, "completed"),
          isNull(studioInterviewSchedule.candidateFeedbackSubmittedAt),
        ),
      )
      .returning({
        categories: studioInterviewSchedule.candidateFeedbackCategories,
        detail: studioInterviewSchedule.candidateFeedbackDetail,
      });
    if (!updated) {
      throw new ConflictException("Interview feedback cannot be submitted", {
        errorCode: "INTERVIEW_FEEDBACK_CONFLICT",
      });
    }
    return {
      feedback: { ...updated, submittedAt: submittedAt.toISOString() },
    };
  }

  async complete(input: { interviewId: string; mode: "interrupt" | "final"; roundId: string }) {
    const [round] = await this.database
      .select({
        conversationId: studioInterviewSchedule.conversationId,
        interviewRecordId: studioInterviewSchedule.interviewRecordId,
        liveKitRoomName: studioInterviewSchedule.liveKitRoomName,
        organizationId: studioInterviewSchedule.organizationId,
        status: studioInterviewSchedule.status,
      })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.id, input.roundId),
          eq(studioInterviewSchedule.interviewRecordId, input.interviewId),
        ),
      )
      .limit(1);
    if (!round) {
      throw new NotFoundException("Interview round not found", {
        errorCode: "INTERVIEW_ROUND_NOT_FOUND",
      });
    }
    if (round.status === "completed") {
      return { success: true } as const;
    }
    const now = new Date();
    if (input.mode === "interrupt") {
      if (round.status === "in_progress" || round.status === "interrupted") {
        await this.database
          .update(studioInterviewSchedule)
          .set({ disconnectedAt: now, status: "interrupted", updatedAt: now })
          .where(eq(studioInterviewSchedule.id, input.roundId));
      }
      return { success: true } as const;
    }
    const conversationId = round.conversationId ?? round.liveKitRoomName;
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(studioInterviewSchedule)
        .set({ conversationId, status: "completed", updatedAt: now })
        .where(eq(studioInterviewSchedule.id, input.roundId));
      if (conversationId) {
        await transaction
          .insert(interviewConversation)
          .values({
            conversationId,
            endedAt: now,
            interviewRecordId: round.interviewRecordId,
            lastSyncedAt: now,
            metadata: { closeReason: INTERVIEW_END_REASON.CANDIDATE_CLICKED_END },
            mode: "voice",
            organizationId: round.organizationId,
            scheduleEntryId: input.roundId,
            status: "completed",
          })
          .onConflictDoUpdate({
            set: {
              endedAt: now,
              lastSyncedAt: now,
              metadata: sql`${interviewConversation.metadata} || ${JSON.stringify({ closeReason: INTERVIEW_END_REASON.CANDIDATE_CLICKED_END })}::jsonb`,
              status: "completed",
            },
            target: interviewConversation.conversationId,
          });
      }
    });
    await this.jobs.enqueueInterviewCompleted(input.roundId);
    return { success: true } as const;
  }

  async createLiveKitToken(input: { interviewId: string; roundId: string }) {
    const { record, snapshot, view } = await this.loadView(input);
    if (view.currentRoundStatus === "completed") {
      throw new ForbiddenException("Interview round is completed", {
        errorCode: "INTERVIEW_ROUND_COMPLETED",
      });
    }
    const questions = this.presetQuestions(snapshot);
    if (questions.length === 0) {
      throw new ConflictException("Interview questions are required", {
        errorCode: "INTERVIEW_QUESTIONS_REQUIRED",
      });
    }
    if (snapshot.forms.length > 0) {
      const submissions = await this.database
        .select({ templateId: candidateFormSubmission.templateId })
        .from(candidateFormSubmission)
        .where(
          and(
            eq(candidateFormSubmission.interviewRecordId, input.interviewId),
            inArray(
              candidateFormSubmission.templateId,
              snapshot.forms.map((form) => form.templateId),
            ),
          ),
        );
      if (
        new Set(submissions.map((submission) => submission.templateId)).size < snapshot.forms.length
      ) {
        throw new ConflictException("Interview forms must be completed first", {
          errorCode: "INTERVIEW_FORMS_REQUIRED",
        });
      }
    }
    const apiKey = rawBackendEnvironment.LIVEKIT_API_KEY?.trim();
    const apiSecret = rawBackendEnvironment.LIVEKIT_API_SECRET?.trim();
    const serverUrl = rawBackendEnvironment.LIVEKIT_URL?.trim();
    if (!(apiKey && apiSecret && serverUrl)) {
      throw new InternalServerErrorException("LiveKit is not configured", {
        errorCode: "LIVEKIT_NOT_CONFIGURED",
      });
    }
    const now = new Date();
    const resolution = await this.database.transaction(async (transaction) => {
      const [round] = await transaction
        .select()
        .from(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.id, input.roundId),
            eq(studioInterviewSchedule.interviewRecordId, input.interviewId),
          ),
        )
        .limit(1)
        .for("update");
      if (!round || round.status === "completed") {
        throw new ForbiddenException("Interview round is completed", {
          errorCode: "INTERVIEW_ROUND_COMPLETED",
        });
      }
      this.assertInvitationAccess(round, now);
      if (
        round.candidateInviteTokenHash &&
        round.status === "pending" &&
        round.candidateInviteStatus !== "accepted"
      ) {
        await transaction
          .update(studioInterviewSchedule)
          .set({ candidateInviteStatus: "accepted", candidateRespondedAt: now, updatedAt: now })
          .where(eq(studioInterviewSchedule.id, round.id));
      }
      if (
        round.status === "interrupted" &&
        round.disconnectedAt &&
        now.getTime() - round.disconnectedAt.getTime() > 180_000
      ) {
        await transaction
          .update(studioInterviewSchedule)
          .set({
            disconnectedAt: null,
            liveKitParticipantIdentity: null,
            liveKitRoomName: null,
            status: "completed",
            updatedAt: now,
          })
          .where(eq(studioInterviewSchedule.id, round.id));
        throw new GoneException("Interview reconnect grace period expired", {
          errorCode: "INTERVIEW_RECONNECT_GRACE_EXPIRED",
        });
      }
      if (round.liveKitRoomName && round.liveKitParticipantIdentity) {
        return {
          identity: round.liveKitParticipantIdentity,
          isReconnect: round.status === "interrupted",
          roomName: round.liveKitRoomName,
        };
      }
      const suffix = Math.floor(Math.random() * 10_000);
      const roomName = `interview_${input.interviewId}_${input.roundId}_${suffix}`;
      const identity = `candidate_${input.interviewId}_${input.roundId}_${suffix}`;
      await transaction
        .update(studioInterviewSchedule)
        .set({
          disconnectedAt: null,
          liveKitParticipantIdentity: identity,
          liveKitRoomName: roomName,
          sessionStartedAt: now,
          status: "in_progress",
          updatedAt: now,
        })
        .where(eq(studioInterviewSchedule.id, round.id));
      return { identity, isReconnect: false, roomName };
    });
    const { identity, isReconnect, roomName } = resolution;
    const selectedInterviewer = selectInterviewDispatchInterviewer(
      snapshot.interviewers,
      input.roundId,
    );
    const metadata = JSON.stringify(
      buildInterviewDispatchMetadata({
        allowTextInput: view.currentRoundAllowTextInput,
        candidateName: snapshot.candidate.candidateName,
        closingInstructions: snapshot.globalConfig.closingInstructions,
        companyContext: snapshot.globalConfig.companyContext,
        interviewQuestions: snapshot.personalizedQuestions,
        interviewRecordId: input.interviewId,
        jobDescriptionPresetQuestions: questions,
        jobDescriptionPrompt: snapshot.jobDescription?.prompt ?? null,
        openingInstructions: snapshot.globalConfig.openingInstructions,
        recordingEnabled: this.recordingEnabled(),
        recordingFileKey: this.recordingEnabled() ? this.recordingFileKey(input, roomName) : null,
        resumeProfile: snapshot.candidate.resumeProfile,
        roundId: input.roundId,
        selectedInterviewer,
        targetRole: snapshot.jobDescription?.name ?? record.targetRole,
      }),
    );
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      metadata,
      name: snapshot.candidate.candidateName,
      ttl: "15m",
    });
    token.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: roomName,
      roomJoin: true,
    });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: rawBackendEnvironment.AGENT_NAME?.trim() || "giaogiao",
        }),
      ],
    });
    return {
      isReconnect,
      participantName: snapshot.candidate.candidateName,
      participantToken: await token.toJwt(),
      roomName,
      serverUrl,
    };
  }

  private async loadRecord(id: string) {
    const [record] = await this.database
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, id))
      .limit(1);
    if (!record || record.pipelineStage === "closed") {
      throw new NotFoundException("Interview not available", {
        errorCode: "CANDIDATE_INTERVIEW_NOT_AVAILABLE",
      });
    }
    return record;
  }

  private async loadSnapshot(interviewId: string) {
    const [row] = await this.database
      .select({ payload: interviewContextSnapshot.payload })
      .from(interviewContextSnapshot)
      .where(
        and(
          eq(interviewContextSnapshot.interviewRecordId, interviewId),
          eq(interviewContextSnapshot.status, "active"),
        ),
      )
      .orderBy(desc(interviewContextSnapshot.version))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Interview context is not available", {
        errorCode: "INTERVIEW_CONTEXT_NOT_AVAILABLE",
      });
    }
    return row.payload;
  }

  private async loadView(input: { interviewId: string; roundId: string }) {
    const record = await this.loadRecord(input.interviewId);
    const entries = await this.database
      .select()
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.interviewRecordId, input.interviewId));
    const view = buildCandidateInterviewView(record, sortScheduleEntries(entries), input.roundId);
    const snapshot = await this.loadSnapshot(input.interviewId);
    return { record, snapshot, view };
  }

  private async ensureInvitationAccess(roundId: string) {
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      const [round] = await transaction
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, roundId))
        .limit(1)
        .for("update");
      if (!round) {
        throw new NotFoundException("Interview round not found", {
          errorCode: "INTERVIEW_ROUND_NOT_FOUND",
        });
      }
      this.assertInvitationAccess(round, now);
      if (
        round.candidateInviteTokenHash &&
        round.status === "pending" &&
        round.candidateInviteStatus !== "accepted"
      ) {
        await transaction
          .update(studioInterviewSchedule)
          .set({ candidateInviteStatus: "accepted", candidateRespondedAt: now, updatedAt: now })
          .where(eq(studioInterviewSchedule.id, roundId));
      }
    });
  }

  private assertInvitationAccess(round: typeof studioInterviewSchedule.$inferSelect, now: Date) {
    if (!round.candidateInviteTokenHash) {
      return;
    }
    if (
      round.candidateInviteStatus === "declined" ||
      round.candidateInviteStatus === "expired" ||
      (round.status === "pending" &&
        (!round.candidateInviteExpiresAt || round.candidateInviteExpiresAt <= now))
    ) {
      throw new ForbiddenException("Interview invitation is unavailable", {
        errorCode: "INTERVIEW_INVITATION_UNAVAILABLE",
      });
    }
  }

  private recordingEnabled() {
    return (
      resolveInterviewRecordingEnabled(rawBackendEnvironment) &&
      Boolean(
        rawBackendEnvironment.RECORDING_R2_BUCKET_NAME &&
        rawBackendEnvironment.RECORDING_R2_ACCESS_KEY_ID &&
        rawBackendEnvironment.RECORDING_R2_SECRET_ACCESS_KEY &&
        rawBackendEnvironment.RECORDING_R2_ENDPOINT,
      )
    );
  }

  private recordingFileKey(input: { interviewId: string; roundId: string }, roomName: string) {
    const prefix = rawBackendEnvironment.RECORDING_R2_KEY_PREFIX?.trim().replace(/\/+$/u, "");
    return `${prefix ? `${prefix}/` : ""}interviews/${input.interviewId}/${input.roundId}/${roomName}.mp4`;
  }

  private presetQuestions(snapshot: Awaited<ReturnType<InterviewService["loadSnapshot"]>>) {
    return snapshot.questionTemplates
      .filter((template) => !template.disabledByUser)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .flatMap((template) =>
        template.snapshot.questions
          .toSorted((left, right) => left.sortOrder - right.sortOrder)
          .filter((question) => question.content.trim())
          .map((question) => ({
            content: question.content.trim(),
            difficulty: question.difficulty,
            evaluationFocus: question.evaluationFocus ?? null,
            followUpDirections: question.followUpDirections ?? null,
            id: question.id,
          })),
      );
  }
}
