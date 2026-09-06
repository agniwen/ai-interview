import { syncHumanInterviewRoundNodeTx } from "@app/database/recruiting-pipeline";
import {
  recruitingRecord,
  jobDescription,
  humanInterviewEvaluationDocumentSync,
  recruitingMeetingContext,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewEvaluationSnapshot,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
/* oxlint-disable max-lines -- evaluation read, publish, and submission transactions share one injected DAO boundary. */
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
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
import type { TranscriptAttribution } from "@app/db-schema/human-interview-recording";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface EvaluationMeetingTranscriptRevision {
  id: string;
  turns: {
    attribution?: TranscriptAttribution | null;
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
      .from(humanInterviewEvaluationSnapshot)
      .where(
        and(
          eq(humanInterviewEvaluationSnapshot.organizationId, input.organizationId),
          eq(humanInterviewEvaluationSnapshot.roundId, input.roundId),
        ),
      )
      .orderBy(asc(humanInterviewEvaluationSnapshot.createdAt));
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
            candidateName: recruitingRecordReadModel.candidateName,
            candidateRecordingStatus: humanInterviewMeeting.candidateRecordingStatus,
            createdAt: humanInterviewMeeting.createdAt,
            createdBy: humanInterviewMeeting.createdBy,
            endedAt: humanInterviewMeeting.endedAt,
            interviewRecordId: humanInterviewRound.recruitingRecordId,
            processingMeetingSessionId: humanInterviewMeeting.processingMeetingSessionId,
            recordingStatus: humanInterviewMeeting.recordingStatus,
            scheduledAt: humanInterviewMeeting.scheduledAt,
            startedAt: humanInterviewMeeting.startedAt,
            status: humanInterviewMeeting.status,
            title: humanInterviewMeeting.title,
          })
          .from(humanInterviewMeeting)
          .innerJoin(
            humanInterviewMeetingRound,
            eq(humanInterviewMeetingRound.meetingId, humanInterviewMeeting.id),
          )
          .innerJoin(
            humanInterviewRound,
            eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId),
          )
          .innerJoin(
            recruitingRecordReadModel,
            eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
          )
          .where(
            and(
              eq(humanInterviewMeeting.id, input.meetingId),
              eq(humanInterviewMeeting.organizationId, input.organizationId),
              eq(humanInterviewRound.id, input.roundId),
            ),
          )
          .for("update", { of: humanInterviewMeeting })
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
            liveTranscriptDraft: humanInterviewMeetingInterviewer.liveTranscriptDraft,
            name: user.name,
            role: humanInterviewMeetingInterviewer.role,
            userId: humanInterviewMeetingInterviewer.userId,
          })
          .from(humanInterviewMeetingInterviewer)
          .innerJoin(user, eq(user.id, humanInterviewMeetingInterviewer.userId))
          .where(eq(humanInterviewMeetingInterviewer.meetingId, input.meetingId));
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
        await tx.insert(recruitingMeetingContext).values({
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
          .update(humanInterviewMeeting)
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
          .where(eq(humanInterviewMeeting.id, input.meetingId));
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
        evaluation: humanInterviewRound.evaluation,
        evaluationError: humanInterviewRound.evaluationError,
        evaluationStatus: humanInterviewRound.evaluationStatus,
        evaluationUpdatedAt: humanInterviewRound.evaluationUpdatedAt,
        evaluationUpdatedBy: humanInterviewRound.evaluationUpdatedBy,
        meetingSessionId: humanInterviewMeeting.processingMeetingSessionId,
        outcome: humanInterviewRound.outcome,
        recordingError: humanInterviewMeeting.recordingError,
        recordingTracks: humanInterviewMeeting.recordingTracks,
        roundId: humanInterviewRound.id,
        roundStatus: humanInterviewRound.status,
        transcriptionError: meetingSession.transcriptionError,
        transcriptionStatus: meetingSession.transcriptionStatus,
      })
      .from(humanInterviewMeetingRound)
      .innerJoin(
        humanInterviewMeeting,
        eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
      )
      .innerJoin(
        humanInterviewRound,
        eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId),
      )
      .leftJoin(
        meetingSession,
        eq(meetingSession.id, humanInterviewMeeting.processingMeetingSessionId),
      )
      .where(
        and(
          eq(humanInterviewMeeting.id, input.meetingId),
          eq(humanInterviewMeeting.organizationId, input.organizationId),
          eq(humanInterviewRound.id, input.roundId),
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
      recordingNotice:
        row.recordingError ??
        (row.recordingTracks?.some((track) => track.status === "failed")
          ? "部分录音缺失，已保留可用内容，可手动提交评价。"
          : null),
      roundId: row.roundId,
      roundStatus: row.roundStatus,
      transcript,
      transcriptionError: row.transcriptionError ?? row.recordingError,
      transcriptionState: humanInterviewTranscriptionStateSchema.parse(
        row.transcriptionStatus ??
          (row.recordingError?.startsWith("录音处理失败：") ? "failed" : "pending"),
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
          evaluationStatus: humanInterviewRound.evaluationStatus,
          roundId: humanInterviewRound.id,
          roundStatus: humanInterviewRound.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(humanInterviewMeeting)
        .innerJoin(
          humanInterviewMeetingRound,
          eq(humanInterviewMeetingRound.meetingId, humanInterviewMeeting.id),
        )
        .innerJoin(
          humanInterviewRound,
          eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId),
        )
        .innerJoin(
          meetingSession,
          eq(meetingSession.id, humanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(humanInterviewMeeting.processingMeetingSessionId, input.meetingSessionId),
            eq(humanInterviewMeeting.organizationId, input.organizationId),
          ),
        )
        .for("update", { of: humanInterviewRound })
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
        .update(humanInterviewRound)
        .set({
          evaluationError: null,
          evaluationStatus: "generating",
          evaluationTranscriptRevisionId: context.activeTranscriptRevisionId,
          evaluationUpdatedAt: new Date(),
        })
        .where(eq(humanInterviewRound.id, context.roundId));
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
        .select({ evaluationStatus: humanInterviewRound.evaluationStatus })
        .from(humanInterviewRound)
        .innerJoin(
          humanInterviewMeetingRound,
          eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
        )
        .innerJoin(
          humanInterviewMeeting,
          eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
        )
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
            eq(humanInterviewMeeting.processingMeetingSessionId, input.meetingSessionId),
          ),
        )
        .for("update", { of: humanInterviewRound })
        .limit(1);
      if (!round || ["draft", "submitted"].includes(round.evaluationStatus)) {
        return null;
      }
      await tx
        .update(humanInterviewRound)
        .set({
          evaluationError: null,
          evaluationStatus: "generating",
          evaluationTranscriptRevisionId: transcript.activeTranscriptRevisionId,
          evaluationUpdatedAt: new Date(),
        })
        .where(eq(humanInterviewRound.id, input.roundId));
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
        meetingSessionId: humanInterviewMeeting.processingMeetingSessionId,
        organizationId: humanInterviewMeeting.organizationId,
        roundId: humanInterviewRound.id,
        transcriptRevisionId: humanInterviewRound.evaluationTranscriptRevisionId,
      })
      .from(humanInterviewRound)
      .innerJoin(
        humanInterviewMeetingRound,
        eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
      )
      .innerJoin(
        humanInterviewMeeting,
        eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
      )
      .where(eq(humanInterviewRound.evaluationStatus, "generating"));
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
    turns: EvaluationMeetingTranscriptRevision["turns"];
  } | null> {
    const [context, transcript] = await Promise.all([
      db
        .select({
          candidateName: recruitingRecordReadModel.candidateName,
          jobDescription: jobDescription.prompt,
          resume: recruitingRecordReadModel.resumeText,
        })
        .from(humanInterviewRound)
        .innerJoin(
          recruitingRecordReadModel,
          eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
        )
        .leftJoin(jobDescription, eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId))
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
            eq(humanInterviewRound.evaluationStatus, "generating"),
            eq(humanInterviewRound.evaluationTranscriptRevisionId, input.transcriptRevisionId),
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
        attribution: turn.attribution,
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
          evaluationStatus: humanInterviewRound.evaluationStatus,
          evaluationTranscriptRevisionId: humanInterviewRound.evaluationTranscriptRevisionId,
        })
        .from(humanInterviewRound)
        .innerJoin(
          humanInterviewMeetingRound,
          eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
        )
        .innerJoin(
          humanInterviewMeeting,
          eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
        )
        .innerJoin(
          meetingSession,
          eq(meetingSession.id, humanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
            eq(meetingSession.id, input.meetingSessionId),
          ),
        )
        .for("update", { of: humanInterviewRound })
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
            .update(humanInterviewRound)
            .set({
              evaluationError: "会议转录已更新，请基于最新转录重新生成评价。",
              evaluationStatus: "failed",
              evaluationUpdatedAt: new Date(),
            })
            .where(eq(humanInterviewRound.id, input.roundId));
        }
        return false;
      }
      const [updated] = await tx
        .update(humanInterviewRound)
        .set({
          evaluation,
          evaluationError: null,
          evaluationStatus: "draft",
          evaluationUpdatedAt: new Date(),
          evaluationUpdatedBy: null,
        })
        .where(eq(humanInterviewRound.id, input.roundId))
        .returning({ id: humanInterviewRound.id });
      if (updated) {
        await tx.insert(humanInterviewEvaluationSnapshot).values({
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
      .update(humanInterviewRound)
      .set({
        evaluationError: input.error,
        evaluationStatus: "failed",
        evaluationUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(humanInterviewRound.id, input.roundId),
          eq(humanInterviewRound.evaluationStatus, "generating"),
          eq(humanInterviewRound.evaluationTranscriptRevisionId, input.transcriptRevisionId),
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
          evaluationStatus: humanInterviewRound.evaluationStatus,
          id: humanInterviewRound.id,
          meetingSessionId: meetingSession.id,
          roundStatus: humanInterviewRound.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(humanInterviewRound)
        .innerJoin(
          humanInterviewMeetingRound,
          eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
        )
        .innerJoin(
          humanInterviewMeeting,
          eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
        )
        .leftJoin(
          meetingSession,
          eq(meetingSession.id, humanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
            input.meetingSessionId ? eq(meetingSession.id, input.meetingSessionId) : undefined,
          ),
        )
        .for("update", { of: humanInterviewRound })
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
        .update(humanInterviewRound)
        .set({
          evaluation,
          evaluationError: null,
          evaluationStatus: "draft",
          evaluationTranscriptRevisionId: input.transcriptRevisionId,
          evaluationUpdatedAt: new Date(),
          evaluationUpdatedBy: input.actorId,
        })
        .where(eq(humanInterviewRound.id, input.roundId))
        .returning({ id: humanInterviewRound.id });
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
    if (input.outcome !== "pass" && input.outcome !== "fail") {
      return false;
    }
    const evaluation = humanInterviewEvaluationSchema.parse(input.evaluation);
    const now = new Date();
    return await db.transaction(async (tx) => {
      // 招聘记录先锁，再锁会议/轮次，与流程回退、取消保持一致，避免旧结果覆盖当前节点。
      const [owner] = await tx
        .select({ recordId: humanInterviewRound.recruitingRecordId })
        .from(humanInterviewRound)
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
          ),
        );
      if (!owner) {
        return false;
      }
      await tx
        .select({ id: recruitingRecord.id })
        .from(recruitingRecord)
        .where(eq(recruitingRecord.id, owner.recordId))
        .for("update");
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
          evaluationStatus: humanInterviewRound.evaluationStatus,
          organizationId: humanInterviewRound.organizationId,
          roundStatus: humanInterviewRound.status,
          transcriptionStatus: meetingSession.transcriptionStatus,
        })
        .from(humanInterviewRound)
        .innerJoin(
          humanInterviewMeetingRound,
          eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
        )
        .innerJoin(
          humanInterviewMeeting,
          eq(humanInterviewMeeting.id, humanInterviewMeetingRound.meetingId),
        )
        .leftJoin(
          meetingSession,
          eq(meetingSession.id, humanInterviewMeeting.processingMeetingSessionId),
        )
        .where(
          and(
            eq(humanInterviewRound.id, input.roundId),
            eq(humanInterviewRound.organizationId, input.organizationId),
            input.meetingSessionId
              ? eq(humanInterviewMeeting.processingMeetingSessionId, input.meetingSessionId)
              : undefined,
          ),
        )
        .for("update", { of: humanInterviewRound })
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
        .update(humanInterviewRound)
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
        .where(eq(humanInterviewRound.id, input.roundId));
      await syncHumanInterviewRoundNodeTx(tx, {
        now,
        operatorId: input.actorId,
        organizationId: input.organizationId,
        outcome: input.outcome,
        recordId: owner.recordId,
        roundId: input.roundId,
      });
      const snapshotId = crypto.randomUUID();
      await tx.insert(humanInterviewEvaluationSnapshot).values({
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
      await tx.insert(humanInterviewEvaluationDocumentSync).values({
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
