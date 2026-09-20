import type { Database } from "@app/database";
import { createRecruitingRecords } from "@app/database/recruiting-records";
import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import {
  humanInterviewEvaluationSnapshot,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
  meetingSession,
  meetingTranscriptRevision,
  organization,
  recruitingNodeState,
  user,
} from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";
import { loadHumanInterviewRoundReadiness } from "../human-interview-rounds";

it.each(
  (["second_interview", "final_interview"] as const).flatMap((roundKind) =>
    ([null, "pending", "processing", "failed"] as const).map((transcriptionStatus) => ({
      roundKind,
      transcriptionStatus,
    })),
  ),
)(
  "$roundKind accepts manual draft and submission with optional text empty and transcription $transcriptionStatus",
  async ({ roundKind, transcriptionStatus }) => {
    const rollback = new Error("rollback isolated fixture");
    await expect(
      db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        await tx.insert(user).values({ email: `${id}@example.com`, id, name: "测试面试官" });
        await tx
          .insert(organization)
          .values({ createdAt: new Date(), id, name: "选填评价回归测试", slug: id });
        await createRecruitingRecords(tx, {
          candidateName: "测试候选人",
          id,
          organizationId: id,
          pipelineStage: roundKind,
        });
        await tx.insert(humanInterviewRound).values({
          format: "online",
          id,
          label: "测试面试",
          organizationId: id,
          recruitingRecordId: id,
          roundKind,
        });
        await tx
          .update(recruitingNodeState)
          .set({ effectiveHumanRoundId: id })
          .where(
            and(
              eq(recruitingNodeState.recruitingRecordId, id),
              eq(recruitingNodeState.node, roundKind),
            ),
          );
        const reviewRevisionId = `${id}-review`;
        if (transcriptionStatus) {
          await tx.insert(meetingSession).values({
            id,
            manifestSha256: "a".repeat(64),
            organizationId: id,
            ownerId: id,
            savedAt: new Date(),
            startedAt: new Date(),
            status: "ready",
            title: "待复核转录测试",
            transcriptionStatus,
          });
          await tx.insert(meetingTranscriptRevision).values({
            id: reviewRevisionId,
            kind: "human",
            meetingId: id,
            model: "manual",
            organizationId: id,
            pipelineVersion: "human-v1",
            provider: "human",
            quality: "needs_review",
            region: "local",
            revision: 1,
            sourceManifestSha256: "a".repeat(64),
          });
          await tx
            .update(meetingSession)
            .set({ reviewTranscriptRevisionId: reviewRevisionId })
            .where(eq(meetingSession.id, id));
        }
        await tx.insert(humanInterviewMeeting).values({
          id,
          organizationId: id,
          processingMeetingSessionId: transcriptionStatus ? id : null,
          status: "ended",
          title: "测试会议",
        });
        await tx
          .insert(humanInterviewMeetingRound)
          .values({ meetingId: id, organizationId: id, roundId: id });
        // SAFETY: submission only uses transaction(); bind it to this real transaction so all fixture writes roll back.
        const dao = createHumanInterviewEvaluationDao(
          { transaction: tx.transaction.bind(tx) } as Database,
          {
            enqueueHumanInterviewRoundCompletion: () => Promise.resolve(),
            loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
          },
        );
        const input = {
          actorId: id,
          evaluation: {
            detailedAnalysis: "",
            evidenceTurnIds: [],
            overallEvaluation: "",
            professionalSkill: "",
            rating: "B" as const,
            risks: "",
            rolePosition: "",
            salaryRecommendation: "",
            seniorityPosition: "",
            strengths: "",
          },
          meetingSessionId: transcriptionStatus ? id : null,
          organizationId: id,
          outcome: "pass" as const,
          roundId: id,
          transcriptRevisionId: transcriptionStatus ? reviewRevisionId : null,
        };
        if (transcriptionStatus) {
          const staleInput = { ...input, transcriptRevisionId: `${id}-stale` };
          expect(await dao.saveHumanInterviewEvaluationDraft(staleInput)).toBe(false);
          expect(await dao.submitHumanInterviewEvaluation(staleInput)).toBe(false);
        }
        expect(await dao.saveHumanInterviewEvaluationDraft(input)).toBe(true);
        expect(await dao.submitHumanInterviewEvaluation(input)).toBe(true);
        const [round] = await tx
          .select()
          .from(humanInterviewRound)
          .where(eq(humanInterviewRound.id, id));
        expect(round).toMatchObject({
          evaluationStatus: "submitted",
          feedback: "",
          outcome: "pass",
          status: "completed",
        });
        const [node] = await tx
          .select()
          .from(recruitingNodeState)
          .where(
            and(
              eq(recruitingNodeState.recruitingRecordId, id),
              eq(recruitingNodeState.node, roundKind),
            ),
          );
        expect(node).toMatchObject({
          effectiveHumanRoundId: id,
          result: "pass",
          status: "completed",
        });
        const snapshots = await tx
          .select()
          .from(humanInterviewEvaluationSnapshot)
          .where(eq(humanInterviewEvaluationSnapshot.roundId, id));
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toMatchObject({
          evaluation: { overallEvaluation: "", rating: "B" },
          source: "human_submitted",
          transcriptRevisionId: input.transcriptRevisionId,
        });
        const readiness = await loadHumanInterviewRoundReadiness(id, id, tx);
        expect(readiness.completedRoundsMissingFeedback).toBe(0);
        expect(
          roundKind === "final_interview"
            ? readiness.finalInterviewPassed
            : readiness.secondInterviewPassed,
        ).toBe(true);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  },
);
