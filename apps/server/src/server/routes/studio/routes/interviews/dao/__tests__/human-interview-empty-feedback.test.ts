import type { Database } from "@app/database";
import { createRecruitingRecords } from "@app/database/recruiting-records";
import { createHumanInterviewEvaluationDao } from "@app/meeting-processing/human-interview";
import {
  humanInterviewEvaluationSnapshot,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
  organization,
  recruitingNodeState,
  user,
} from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db } from "../../../../../../../lib/server/db/index";
import { loadHumanInterviewRoundReadiness } from "../human-interview-rounds";

it.each(["second_interview", "final_interview"] as const)(
  "%s accepts a submitted passing evaluation without optional text",
  async (roundKind) => {
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
        await tx
          .insert(humanInterviewMeeting)
          .values({ id, organizationId: id, status: "ended", title: "测试会议" });
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
        expect(
          await dao.submitHumanInterviewEvaluation({
            actorId: id,
            evaluation: {
              detailedAnalysis: "",
              evidenceTurnIds: [],
              overallEvaluation: "",
              professionalSkill: "",
              rating: "B",
              risks: "",
              rolePosition: "",
              salaryRecommendation: "",
              seniorityPosition: "",
              strengths: "",
            },
            meetingSessionId: null,
            organizationId: id,
            outcome: "pass",
            roundId: id,
            transcriptRevisionId: null,
          }),
        ).toBe(true);
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
