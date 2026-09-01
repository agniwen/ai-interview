/* oxlint-disable complexity -- The owner keeps transition invariants and its audit append in one locked transaction. */
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  interviewAuditLog,
  studioHumanInterviewRound,
  studioInterview,
} from "@arc/db-schema/schema";
import {
  canApplyCandidatePipelineEvent,
  getCandidatePipelineEventForTargetStage,
} from "@arc/shared/candidate-pipeline-machine";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  CandidateCopilotCommands,
  CandidateCopilotTransitionInput,
  CandidateCopilotTransitionResult,
} from "./candidate-copilot.commands.js";

@Injectable()
export class CandidateCopilotService implements CandidateCopilotCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async draftInterviewQuestions(
    input: Parameters<CandidateCopilotCommands["draftInterviewQuestions"]>[0],
  ): Promise<void> {
    const now = new Date();
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(studioInterview)
        .set({ interviewQuestions: input.questions, updatedAt: now })
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        );
      await transaction.insert(interviewAuditLog).values({
        action: "interview_questions_drafted",
        createdAt: now,
        detail: {
          copilotActionProposalId: input.proposalId,
          copilotActionTitle: input.proposalTitle,
          questionCount: input.questions.length,
          source: "workspace_recruiting_copilot",
        },
        id: crypto.randomUUID(),
        interviewRecordId: input.resumeRecordId,
        operatorId: input.actorId,
        organizationId: input.organizationId,
      });
    });
  }

  transitionCandidate(
    input: CandidateCopilotTransitionInput,
  ): Promise<CandidateCopilotTransitionResult> {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({
          closedMeta: studioInterview.closedMeta,
          jobDescriptionId: studioInterview.jobDescriptionId,
          outcome: studioInterview.outcome,
          pipelineStage: studioInterview.pipelineStage,
        })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!existing) {
        return { kind: "not_found" };
      }
      if (
        existing.pipelineStage === "closed" &&
        input.targetStage !== "closed" &&
        !input.reactivationReason?.trim()
      ) {
        return { kind: "invalid", message: "请填写重新激活原因。" };
      }
      if (input.targetStage === "human_interview" && !existing.jobDescriptionId) {
        return { kind: "invalid", message: "请先绑定在招岗位后再安排真人面试" };
      }
      let humanInterviewReadyForOffer = false;
      if (existing.pipelineStage === "human_interview" && input.targetStage === "offer") {
        const rounds = await transaction
          .select({
            feedback: studioHumanInterviewRound.feedback,
            status: studioHumanInterviewRound.status,
          })
          .from(studioHumanInterviewRound)
          .where(eq(studioHumanInterviewRound.interviewRecordId, input.resumeRecordId));
        const active = rounds.filter((round) => round.status !== "cancelled");
        humanInterviewReadyForOffer =
          active.length > 0 &&
          active.every((round) => round.status === "completed" && Boolean(round.feedback?.trim()));
      }
      if (existing.pipelineStage !== input.targetStage && input.targetStage !== "closed") {
        const event = getCandidatePipelineEventForTargetStage({
          from: existing.pipelineStage,
          to: input.targetStage,
        });
        if (
          !event ||
          !canApplyCandidatePipelineEvent(
            { humanInterviewReadyForOffer, stage: existing.pipelineStage },
            event,
          )
        ) {
          return {
            kind: "invalid",
            message:
              existing.pipelineStage === "human_interview" && input.targetStage === "offer"
                ? "请先完成所有真人面试轮次，并补全每轮面试评价"
                : "当前招聘阶段不能直接推进到目标阶段。",
          };
        }
      }
      const nextOutcome = input.outcome ?? "in_pipeline";
      if (existing.pipelineStage === input.targetStage && existing.outcome === nextOutcome) {
        return { kind: "noop" };
      }
      const now = new Date();
      const closing = input.targetStage === "closed";
      const reactivating = existing.pipelineStage === "closed" && !closing;
      let closedMeta: typeof existing.closedMeta | undefined;
      let closedAt: Date | null | undefined;
      let closedReason: string | null | undefined;
      if (closing) {
        closedAt = now;
        closedMeta = {
          ...existing.closedMeta,
          ...input.closedMeta,
          previousStage: existing.pipelineStage,
        };
        closedReason = input.closedReason ?? null;
      } else if (reactivating) {
        closedAt = null;
        closedMeta = null;
        closedReason = null;
      }
      await transaction
        .update(studioInterview)
        .set({
          closedAt,
          closedMeta,
          closedReason,
          humanInterviewScheduledAt: reactivating ? null : undefined,
          humanInterviewerId: reactivating ? null : undefined,
          offerAcceptedAt: reactivating ? null : undefined,
          offerSentAt: reactivating ? null : undefined,
          outcome: nextOutcome,
          pipelineStage: input.targetStage,
          resumeEvaluationStatus: reactivating ? null : undefined,
          updatedAt: now,
          writtenTestScheduledAt: reactivating ? null : undefined,
          writtenTestScore: reactivating ? null : undefined,
        })
        .where(eq(studioInterview.id, input.resumeRecordId));
      await transaction.insert(interviewAuditLog).values({
        action: "candidate_transition",
        createdAt: now,
        detail: {
          closedMeta: closedMeta ?? null,
          copilotActionProposalId: input.proposalId,
          copilotActionTitle: input.proposalTitle,
          fromOutcome: existing.outcome,
          fromStage: existing.pipelineStage,
          reactivationReason: reactivating ? (input.reactivationReason ?? null) : null,
          reason: input.closedReason ?? null,
          source: "workspace_recruiting_copilot",
          toOutcome: nextOutcome,
          toStage: input.targetStage,
        },
        id: crypto.randomUUID(),
        interviewRecordId: input.resumeRecordId,
        operatorId: input.actorId,
        organizationId: input.organizationId,
        scheduleEntryId: null,
      });
      return { kind: "updated" };
    });
  }
}
