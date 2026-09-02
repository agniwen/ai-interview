/* oxlint-disable max-lines -- evaluation read, publish, and submission transactions share one injected DAO boundary. */
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  jobDescription,
  humanInterviewDocumentSync,
  meetingRecruitingContext,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewEvaluationSnapshot,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import type {
  HumanInterviewEvaluation,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import { humanInterviewEvaluationSchema } from "@app/db-schema/studio-interviews";
import type { HumanInterviewEvaluationJobData } from "@app/meeting-processing-queue/human-interview-evaluation";
import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";
import { z } from "zod";
import {
  isHumanInterviewEvaluationPublishCurrent,
  isHumanInterviewEvaluationSubmissionCurrent,
} from "./human-interview-evaluation-state";

import type { Database } from "@app/database";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface EvaluationMeetingTranscriptRevision {
  id: string;
  turns: {
    id: string;
    speakerDisplayName: string | null;
    speakerKey: string;
    text: string;
  }[];
}

export interface HumanInterviewEvaluationDaoDependencies {
  enqueueHumanInterviewRoundCompletion: (
    tx: Transaction,
    input: {
      actorUserId: string | null;
      now: Date;
      organizationId: string;
      roundId: string;
    },
  ) => Promise<void>;
  loadMeetingTranscriptForEvaluation: (input: {
    meetingId: string;
    organizationId: string;
    revisionId: string;
  }) => Promise<EvaluationMeetingTranscriptRevision | null>;
  loadMeetingTranscriptRevision?: (input: {
    meetingId: string;
    organizationId: string;
    revisionId: string;
  }) => Promise<NonNullable<HumanInterviewReviewRecord["transcript"]> | null>;
}

export type HumanInterviewEvaluationWorkerDaoDependencies = Pick<
  HumanInterviewEvaluationDaoDependencies,
  "loadMeetingTranscriptForEvaluation"
>;

export function createHumanInterviewEvaluationDao(
  db: Database,
  dependencies: HumanInterviewEvaluationDaoDependencies,
) {
  const humanInterviewTranscriptionStateSchema = z.enum([
    "failed",
    "pending",
    "processing",
    "ready",
  ]);

  async function listHumanInterviewEvaluationSnapshotsForAnalysis(input: {
    organizationId: string;
    roundId: string;
  }) {
    return await db
      .select()
      .from(studioHumanInterviewEvaluationSnapshot)
      .where(
        and(
          eq(studioHumanInterviewEvaluationSnapshot.organizationId, input.organizationId),
          eq(studioHumanInterviewEvaluationSnapshot.roundId, input.roundId),
        ),
      )
      .orderBy(asc(studioHumanInterviewEvaluationSnapshot.createdAt));
  }

  type HumanInterviewLiveTranscriptRecoveryResult =
    | { meetingSessionId: string; status: "ready"; transcriptRevisionId: string }
    | { status: "meeting-not-ended" }
    | { status: "no-live-transcript" }
    | { status: "not-found" };

  async function recoverHumanInterviewReviewFromLiveTranscript(input: {
    actorId: string;
    meetingId: string;
    organizationId: string;
    roundId: string;
  }): Promise<HumanInterviewLiveTranscriptRecoveryResult> {
    return await db.transaction(
      // eslint-disable-next-line complexity -- one transaction owns the idempotent fallback session and transcript creation.
      async (tx) => {
        const [meeting] = await tx
          .select({
            candidateName: studioInterview.candidateName,
            candidateRecordingStatus: studioHumanInterviewMeeting.candidateRecordingStatus,
            createdAt: studioHumanInterviewMeeting.createdAt,
            createdBy: studioHumanInterviewMeeting.createdBy,
            endedAt: studioHumanInterviewMeeting.endedAt,
            interviewRecordId: studioHumanInterviewRound.interviewRecordId,
            processingMeetingSessionId: studioHumanInterviewMeeting.processingMeetingSessionId,
            recordingStatus: studioHumanInterviewMeeting.recordingStatus,
            scheduledAt: studioHumanInterviewMeeting.scheduledAt,
            startedAt: studioHumanInterviewMeeting.startedAt,
            status: studioHumanInterviewMeeting.status,
            title: studioHumanInterviewMeeting.title,
          })
          .from(studioHumanInterviewMeeting)
          .innerJoin(
            studioHumanInterviewMeetingRound,
            eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
          )
          .innerJoin(
            studioHumanInterviewRound,
            eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
          )
          .innerJoin(
            studioInterview,
            eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId),
          )
          .where(
            and(
              eq(studioHumanInterviewMeeting.id, input.meetingId),
              eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
              eq(studioHumanInterviewRound.id, input.roundId),
            ),
          )
          .for("update", { of: studioHumanInterviewMeeting })
          .limit(1);
        if (!meeting) {
          return { status: "not-found" };
        }
        if (meeting.status !== "ended") {
          return { status: "meeting-not-ended" };
        }
        if (meeting.processingMeetingSessionId) {
          const [existing] = await tx
            .select({ activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId })
            .from(meetingSession)
            .where(eq(meetingSession.id, meeting.processingMeetingSessionId))
            .limit(1);
          if (existing?.activeTranscriptRevisionId) {
            return {
              meetingSessionId: meeting.processingMeetingSessionId,
              status: "ready",
              transcriptRevisionId: existing.activeTranscriptRevisionId,
            };
          }
          return { status: "no-live-transcript" };
        }

        const interviewers = await tx
          .select({
            liveTranscriptDraft: studioHumanInterviewMeetingInterviewer.liveTranscriptDraft,
            name: user.name,
            role: studioHumanInterviewMeetingInterviewer.role,
            userId: studioHumanInterviewMeetingInterviewer.userId,
          })
          .from(studioHumanInterviewMeetingInterviewer)
          .innerJoin(user, eq(user.id, studioHumanInterviewMeetingInterviewer.userId))
          .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId));
        const transcriptOwner =
          interviewers.find(
            (interviewer) =>
              interviewer.userId === input.actorId && interviewer.liveTranscriptDraft?.turns.length,
          ) ??
          interviewers.find(
            (interviewer) =>
              interviewer.role === "host" && interviewer.liveTranscriptDraft?.turns.length,
          ) ??
          interviewers.find((interviewer) => interviewer.liveTranscriptDraft?.turns.length);
        const liveTranscriptDraft = transcriptOwner?.liveTranscriptDraft;
        const draftTurns = liveTranscriptDraft?.turns.filter((turn) => turn.final) ?? [];
        if (!(transcriptOwner && liveTranscriptDraft && draftTurns.length > 0)) {
          return { status: "no-live-transcript" };
        }

        const manifestSha256 = createHash("sha256")
          .update(JSON.stringify(liveTranscriptDraft))
          .digest("hex");
        const meetingSessionId = crypto.randomUUID();
        const transcriptRevisionId = crypto.randomUUID();
        const now = new Date();
        const ownerId = meeting.createdBy ?? transcriptOwner.userId;
        await tx.insert(meetingSession).values({
          custodianId: ownerId,
          id: meetingSessionId,
          intelligenceStatus: "pending",
          liveTranscriptDraft,
          manifestSha256,
          organizationId: input.organizationId,
          ownerId,
          savedAt: meeting.endedAt ?? now,
          startedAt: meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt,
          status: "ready",
          title: meeting.title,
          transcriptionStatus: "pending",
          verifiedAt: now,
          visibility: "restricted",
        });
        await tx.insert(meetingRecruitingContext).values({
          linkedAt: now,
          linkedBy: input.actorId,
          meetingId: meetingSessionId,
          organizationId: input.organizationId,
          recruitingRecordId: meeting.interviewRecordId,
        });
        await tx.insert(meetingTranscriptRevision).values({
          basedOnRevisionId: null,
          createdBy: input.actorId,
          id: transcriptRevisionId,
          kind: "human",
          language: "zh-CN",
          meetingId: meetingSessionId,
          model: "qwen-realtime-reviewed",
          organizationId: input.organizationId,
          pipelineVersion: "human-live-transcript-recovery-v1",
          processingRunId: null,
          provider: "qwen",
          region: "cn-beijing",
          revision: 1,
          sourceManifestSha256: manifestSha256,
        });
        await tx.insert(meetingTranscriptTurn).values(
          draftTurns.map((turn, sequence) => {
            const startMs = turn.startMs ?? sequence * 1000;
            const endMs = Math.max(startMs + 1, turn.endMs ?? startMs + 1000);
            const candidate = turn.track === "system";
            return {
              confidence: null,
              endMs,
              id: crypto.randomUUID(),
              revisionId: transcriptRevisionId,
              sequence,
              speakerDisplayName: candidate ? meeting.candidateName : transcriptOwner.name,
              speakerKey: candidate
                ? `candidate:${input.roundId}`
                : `interviewer:${transcriptOwner.userId}`,
              startMs,
              text: turn.text,
              track: candidate ? "remote" : "local",
            };
          }),
        );
        await tx
          .update(meetingSession)
          .set({
            activeTranscriptRevisionId: transcriptRevisionId,
            transcriptionError: null,
            transcriptionStatus: "ready",
          })
          .where(eq(meetingSession.id, meetingSessionId));
        await tx
          .update(studioHumanInterviewMeeting)
          .set({
            candidateRecordingError:
              meeting.candidateRecordingStatus === "pending"
                ? "完整录音未生成，已使用实时字幕恢复评价流程"
                : undefined,
            candidateRecordingStatus:
              meeting.candidateRecordingStatus === "pending" ? "failed" : undefined,
            processingMeetingSessionId: meetingSessionId,
            recordingError:
              meeting.recordingStatus === "pending"
                ? "完整录音未生成，已使用实时字幕恢复评价流程"
                : undefined,
            recordingStatus: meeting.recordingStatus === "pending" ? "failed" : undefined,
            updatedAt: now,
          })
          .where(eq(studioHumanInterviewMeeting.id, input.meetingId));
        return { meetingSessionId, status: "ready", transcriptRevisionId };
      },
    );
  }

  async function loadHumanInterviewReview(input: {
    meetingId: string;
    organizationId: string;
    roundId: string;
  }): Promise<HumanInterviewReviewRecord | null> {
    const [row] = await db
      .select({
        activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
        evaluation: studioHumanInterviewRound.evaluation,
        evaluationError: studioHumanInterviewRound.evaluationError,
        evaluationStatus: studioHumanInterviewRound.evaluationStatus,
        evaluationUpdatedAt: studioHumanInterviewRound.evaluationUpdatedAt,
        evaluationUpdatedBy: studioHumanInterviewRound.evaluationUpdatedBy,
        meetingSessionId: studioHumanInterviewMeeting.processingMeetingSessionId,
        outcome: studioHumanInterviewRound.outcome,
        roundId: studioHumanInterviewRound.id,
        roundStatus: studioHumanInterviewRound.status,
        transcriptionError: meetingSession.transcriptionError,
        transcriptionStatus: meetingSession.transcriptionStatus,
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
      .leftJoin(
        meetingSession,
        eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
      )
      .where(
        and(
          eq(studioHumanInterviewMeeting.id, input.meetingId),
          eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
          eq(studioHumanInterviewRound.id, input.roundId),
        ),
      )
      .limit(1);
    if (!row) {
      return null;
    }
    const transcript =
      (row.meetingSessionId && row.activeTranscriptRevisionId
        ? await dependencies.loadMeetingTranscriptRevision?.({
            meetingId: row.meetingSessionId,
            organizationId: input.organizationId,
            revisionId: row.activeTranscriptRevisionId,
          })
        : null) ?? null;
    return {
      evaluation: row.evaluation,
      evaluationError: row.evaluationError,
      evaluationStatus: row.evaluationStatus,
      evaluationUpdatedAt: row.evaluationUpdatedAt?.toISOString() ?? null,
      evaluationUpdatedBy: row.evaluationUpdatedBy,
      meetingSessionId: row.meetingSessionId,
      outcome: row.outcome,
      roundId: row.roundId,
      roundStatus: row.roundStatus,
      transcript,
      transcriptionError: row.transcriptionError,
      transcriptionState: humanInterviewTranscriptionStateSchema.parse(
        row.transcriptionStatus ?? "pending",
      ),
    };
  }

  async function requestHumanInterviewEvaluation(input: {
    force: boolean;
    meetingSessionId: string;
    organizationId: string;
  }): Promise<HumanInterviewEvaluationJobData | null> {
    return await db.transaction(async (tx) => {
      const [context] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          evaluationStatus: studioHumanInterviewRound.evaluationStatus,
          roundId: studioHumanInterviewRound.id,
          roundStatus: studioHumanInterviewRound.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(studioHumanInterviewMeeting)
        .innerJoin(
          studioHumanInterviewMeetingRound,
          eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
        )
        .innerJoin(
          studioHumanInterviewRound,
          eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
        )
        .innerJoin(
          meetingSession,
          eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(studioHumanInterviewMeeting.processingMeetingSessionId, input.meetingSessionId),
            eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
          ),
        )
        .for("update", { of: studioHumanInterviewRound })
        .limit(1);
      if (
        !context?.activeTranscriptRevisionId ||
        context.roundStatus !== "pending" ||
        context.evaluationStatus === "submitted" ||
        context.transcriptionStatus !== "ready" ||
        (!input.force && ["draft", "submitted", "generating"].includes(context.evaluationStatus))
      ) {
        return null;
      }
      await tx
        .update(studioHumanInterviewRound)
        .set({
          evaluationError: null,
          evaluationStatus: "generating",
          evaluationTranscriptRevisionId: context.activeTranscriptRevisionId,
          evaluationUpdatedAt: new Date(),
        })
        .where(eq(studioHumanInterviewRound.id, context.roundId));
      return {
        meetingSessionId: input.meetingSessionId,
        organizationId: input.organizationId,
        roundId: context.roundId,
        transcriptRevisionId: context.activeTranscriptRevisionId,
      };
    });
  }

  async function claimHumanInterviewEvaluationAfterTranscriptCorrection(input: {
    meetingSessionId: string;
    organizationId: string;
    roundId: string;
  }): Promise<HumanInterviewEvaluationJobData | null> {
    return await db.transaction(async (tx) => {
      const [transcript] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingSessionId),
            eq(meetingSession.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!transcript?.activeTranscriptRevisionId || transcript.transcriptionStatus !== "ready") {
        return null;
      }
      const [round] = await tx
        .select({ evaluationStatus: studioHumanInterviewRound.evaluationStatus })
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
            eq(studioHumanInterviewRound.id, input.roundId),
            eq(studioHumanInterviewRound.organizationId, input.organizationId),
            eq(studioHumanInterviewMeeting.processingMeetingSessionId, input.meetingSessionId),
          ),
        )
        .for("update", { of: studioHumanInterviewRound })
        .limit(1);
      if (!round || ["draft", "submitted"].includes(round.evaluationStatus)) {
        return null;
      }
      await tx
        .update(studioHumanInterviewRound)
        .set({
          evaluationError: null,
          evaluationStatus: "generating",
          evaluationTranscriptRevisionId: transcript.activeTranscriptRevisionId,
          evaluationUpdatedAt: new Date(),
        })
        .where(eq(studioHumanInterviewRound.id, input.roundId));
      return {
        meetingSessionId: input.meetingSessionId,
        organizationId: input.organizationId,
        roundId: input.roundId,
        transcriptRevisionId: transcript.activeTranscriptRevisionId,
      };
    });
  }

  async function listRecoverableHumanInterviewEvaluationJobs(): Promise<
    HumanInterviewEvaluationJobData[]
  > {
    const rows = await db
      .select({
        meetingSessionId: studioHumanInterviewMeeting.processingMeetingSessionId,
        organizationId: studioHumanInterviewMeeting.organizationId,
        roundId: studioHumanInterviewRound.id,
        transcriptRevisionId: studioHumanInterviewRound.evaluationTranscriptRevisionId,
      })
      .from(studioHumanInterviewRound)
      .innerJoin(
        studioHumanInterviewMeetingRound,
        eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
      )
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
      )
      .where(eq(studioHumanInterviewRound.evaluationStatus, "generating"));
    return rows.flatMap((row) =>
      row.meetingSessionId && row.transcriptRevisionId
        ? [
            {
              ...row,
              meetingSessionId: row.meetingSessionId,
              transcriptRevisionId: row.transcriptRevisionId,
            },
          ]
        : [],
    );
  }

  async function loadHumanInterviewEvaluationInput(
    input: HumanInterviewEvaluationJobData,
  ): Promise<{
    candidateName: string;
    jobDescription: string;
    resume: string;
    turns: { id: string; speakerDisplayName: string | null; speakerKey: string; text: string }[];
  } | null> {
    const [context, transcript] = await Promise.all([
      db
        .select({
          candidateName: studioInterview.candidateName,
          jobDescription: jobDescription.prompt,
          resume: studioInterview.resumeText,
        })
        .from(studioHumanInterviewRound)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId),
        )
        .leftJoin(jobDescription, eq(jobDescription.id, studioInterview.jobDescriptionId))
        .where(
          and(
            eq(studioHumanInterviewRound.id, input.roundId),
            eq(studioHumanInterviewRound.organizationId, input.organizationId),
            eq(studioHumanInterviewRound.evaluationStatus, "generating"),
            eq(
              studioHumanInterviewRound.evaluationTranscriptRevisionId,
              input.transcriptRevisionId,
            ),
          ),
        )
        .limit(1),
      dependencies.loadMeetingTranscriptForEvaluation({
        meetingId: input.meetingSessionId,
        organizationId: input.organizationId,
        revisionId: input.transcriptRevisionId,
      }),
    ]);
    const [row] = context;
    if (!(row && transcript)) {
      return null;
    }
    return {
      candidateName: row.candidateName,
      jobDescription: row.jobDescription ?? "",
      resume: row.resume ?? "",
      turns: transcript.turns.map((turn) => ({
        id: turn.id,
        speakerDisplayName: turn.speakerDisplayName,
        speakerKey: turn.speakerKey,
        text: turn.text,
      })),
    };
  }

  async function publishHumanInterviewEvaluation(input: {
    evaluation: HumanInterviewEvaluation;
    meetingSessionId: string;
    organizationId: string;
    roundId: string;
    transcriptRevisionId: string;
  }): Promise<boolean> {
    const evaluation = humanInterviewEvaluationSchema.parse(input.evaluation);
    return await db.transaction(async (tx) => {
      const [state] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          evaluationStatus: studioHumanInterviewRound.evaluationStatus,
          evaluationTranscriptRevisionId: studioHumanInterviewRound.evaluationTranscriptRevisionId,
        })
        .from(studioHumanInterviewRound)
        .innerJoin(
          studioHumanInterviewMeetingRound,
          eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
        )
        .innerJoin(
          studioHumanInterviewMeeting,
          eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
        )
        .innerJoin(
          meetingSession,
          eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(studioHumanInterviewRound.id, input.roundId),
            eq(studioHumanInterviewRound.organizationId, input.organizationId),
            eq(meetingSession.id, input.meetingSessionId),
          ),
        )
        .for("update", { of: studioHumanInterviewRound })
        .limit(1);
      if (!state) {
        return false;
      }
      if (!isHumanInterviewEvaluationPublishCurrent(state, input.transcriptRevisionId)) {
        if (
          state.evaluationStatus === "generating" &&
          state.evaluationTranscriptRevisionId === input.transcriptRevisionId
        ) {
          await tx
            .update(studioHumanInterviewRound)
            .set({
              evaluationError: "会议转录已更新，请基于最新转录重新生成评价。",
              evaluationStatus: "failed",
              evaluationUpdatedAt: new Date(),
            })
            .where(eq(studioHumanInterviewRound.id, input.roundId));
        }
        return false;
      }
      const [updated] = await tx
        .update(studioHumanInterviewRound)
        .set({
          evaluation,
          evaluationError: null,
          evaluationStatus: "draft",
          evaluationUpdatedAt: new Date(),
          evaluationUpdatedBy: null,
        })
        .where(eq(studioHumanInterviewRound.id, input.roundId))
        .returning({ id: studioHumanInterviewRound.id });
      if (updated) {
        await tx.insert(studioHumanInterviewEvaluationSnapshot).values({
          evaluation,
          id: crypto.randomUUID(),
          meetingSessionId: input.meetingSessionId,
          organizationId: input.organizationId,
          roundId: input.roundId,
          source: "ai_generated",
          transcriptRevisionId: input.transcriptRevisionId,
        });
      }
      return Boolean(updated);
    });
  }

  async function markHumanInterviewEvaluationFailed(input: {
    error: string;
    roundId: string;
    transcriptRevisionId: string;
  }): Promise<void> {
    await db
      .update(studioHumanInterviewRound)
      .set({
        evaluationError: input.error,
        evaluationStatus: "failed",
        evaluationUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(studioHumanInterviewRound.id, input.roundId),
          eq(studioHumanInterviewRound.evaluationStatus, "generating"),
          eq(studioHumanInterviewRound.evaluationTranscriptRevisionId, input.transcriptRevisionId),
        ),
      );
  }

  async function saveHumanInterviewEvaluationDraft(input: {
    actorId: string;
    evaluation: HumanInterviewEvaluation;
    meetingSessionId: string | null;
    organizationId: string;
    roundId: string;
    transcriptRevisionId: string | null;
  }): Promise<boolean> {
    const evaluation = humanInterviewEvaluationSchema.parse(input.evaluation);
    return await db.transaction(async (tx) => {
      const [context] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          evaluationStatus: studioHumanInterviewRound.evaluationStatus,
          id: studioHumanInterviewRound.id,
          meetingSessionId: meetingSession.id,
          roundStatus: studioHumanInterviewRound.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(studioHumanInterviewRound)
        .innerJoin(
          studioHumanInterviewMeetingRound,
          eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
        )
        .innerJoin(
          studioHumanInterviewMeeting,
          eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
        )
        .leftJoin(
          meetingSession,
          eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(studioHumanInterviewRound.id, input.roundId),
            eq(studioHumanInterviewRound.organizationId, input.organizationId),
            input.meetingSessionId ? eq(meetingSession.id, input.meetingSessionId) : undefined,
          ),
        )
        .for("update", { of: studioHumanInterviewRound })
        .limit(1);
      if (
        !context ||
        context.roundStatus !== "pending" ||
        context.evaluationStatus === "submitted" ||
        !isHumanInterviewEvaluationSubmissionCurrent(context, input.transcriptRevisionId)
      ) {
        return false;
      }
      const [updated] = await tx
        .update(studioHumanInterviewRound)
        .set({
          evaluation,
          evaluationError: null,
          evaluationStatus: "draft",
          evaluationTranscriptRevisionId: input.transcriptRevisionId,
          evaluationUpdatedAt: new Date(),
          evaluationUpdatedBy: input.actorId,
        })
        .where(eq(studioHumanInterviewRound.id, input.roundId))
        .returning({ id: studioHumanInterviewRound.id });
      return Boolean(updated);
    });
  }

  async function submitHumanInterviewEvaluation(input: {
    actorId: string;
    evaluation: HumanInterviewEvaluation;
    meetingSessionId: string | null;
    organizationId: string;
    outcome: HumanInterviewRoundOutcome;
    roundId: string;
    transcriptRevisionId: string | null;
  }): Promise<boolean> {
    const evaluation = humanInterviewEvaluationSchema.parse(input.evaluation);
    const now = new Date();
    return await db.transaction(async (tx) => {
      if (input.meetingSessionId) {
        // Match the transcript-correction path's lock order: session before round.
        // Keep the reviewed revision stable through the final submission commit.
        const [transcript] = await tx
          .select({
            activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
            transcriptionStatus: meetingSession.transcriptionStatus,
          })
          .from(meetingSession)
          .where(
            and(
              eq(meetingSession.id, input.meetingSessionId),
              eq(meetingSession.organizationId, input.organizationId),
            ),
          )
          .for("update")
          .limit(1);
        if (
          !transcript ||
          !isHumanInterviewEvaluationSubmissionCurrent(transcript, input.transcriptRevisionId)
        ) {
          return false;
        }
      }
      const [round] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          evaluationStatus: studioHumanInterviewRound.evaluationStatus,
          organizationId: studioHumanInterviewRound.organizationId,
          roundStatus: studioHumanInterviewRound.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(studioHumanInterviewRound)
        .innerJoin(
          studioHumanInterviewMeetingRound,
          eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
        )
        .innerJoin(
          studioHumanInterviewMeeting,
          eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
        )
        .leftJoin(
          meetingSession,
          eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(studioHumanInterviewRound.id, input.roundId),
            eq(studioHumanInterviewRound.organizationId, input.organizationId),
            input.meetingSessionId
              ? eq(studioHumanInterviewMeeting.processingMeetingSessionId, input.meetingSessionId)
              : undefined,
          ),
        )
        .for("update", { of: studioHumanInterviewRound })
        .limit(1);
      if (
        !round ||
        round.roundStatus !== "pending" ||
        round.evaluationStatus === "submitted" ||
        !isHumanInterviewEvaluationSubmissionCurrent(round, input.transcriptRevisionId)
      ) {
        return false;
      }
      await tx
        .update(studioHumanInterviewRound)
        .set({
          completedAt: now,
          evaluation,
          evaluationError: null,
          evaluationStatus: "submitted",
          evaluationSubmittedAt: now,
          evaluationTranscriptRevisionId: input.transcriptRevisionId,
          evaluationUpdatedAt: now,
          evaluationUpdatedBy: input.actorId,
          feedback: evaluation.overallEvaluation,
          outcome: input.outcome,
          status: "completed",
          updatedAt: now,
        })
        .where(eq(studioHumanInterviewRound.id, input.roundId));
      const snapshotId = crypto.randomUUID();
      await tx.insert(studioHumanInterviewEvaluationSnapshot).values({
        createdBy: input.actorId,
        evaluation,
        id: snapshotId,
        meetingSessionId: input.meetingSessionId,
        organizationId: input.organizationId,
        outcome: input.outcome,
        roundId: input.roundId,
        source: "human_submitted",
        transcriptRevisionId: input.transcriptRevisionId,
      });
      await tx.insert(humanInterviewDocumentSync).values({
        organizationId: input.organizationId,
        roundId: input.roundId,
        snapshotId,
      });
      await dependencies.enqueueHumanInterviewRoundCompletion(tx, {
        actorUserId: input.actorId,
        now,
        organizationId: round.organizationId,
        roundId: input.roundId,
      });
      return true;
    });
  }

  return {
    claimHumanInterviewEvaluationAfterTranscriptCorrection,
    listHumanInterviewEvaluationSnapshotsForAnalysis,
    listRecoverableHumanInterviewEvaluationJobs,
    loadHumanInterviewEvaluationInput,
    loadHumanInterviewReview,
    markHumanInterviewEvaluationFailed,
    publishHumanInterviewEvaluation,
    recoverHumanInterviewReviewFromLiveTranscript,
    requestHumanInterviewEvaluation,
    saveHumanInterviewEvaluationDraft,
    submitHumanInterviewEvaluation,
  };
}

/**
 * Exposes only the evaluation operations used by the background worker.
 * Human submission stays at the server composition boundary because it also
 * creates transactional interview-notification events.
 */
export function createHumanInterviewEvaluationWorkerDao(
  db: Database,
  dependencies: HumanInterviewEvaluationWorkerDaoDependencies,
) {
  const dao = createHumanInterviewEvaluationDao(db, {
    ...dependencies,
    enqueueHumanInterviewRoundCompletion: () => {
      throw new Error("The worker evaluation DAO cannot submit human interview evaluations.");
    },
  });
  return {
    listRecoverableHumanInterviewEvaluationJobs: dao.listRecoverableHumanInterviewEvaluationJobs,
    loadHumanInterviewEvaluationInput: dao.loadHumanInterviewEvaluationInput,
    markHumanInterviewEvaluationFailed: dao.markHumanInterviewEvaluationFailed,
    publishHumanInterviewEvaluation: dao.publishHumanInterviewEvaluation,
    requestHumanInterviewEvaluation: dao.requestHumanInterviewEvaluation,
  };
}
