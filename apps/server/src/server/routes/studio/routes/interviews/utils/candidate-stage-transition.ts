import { and, eq } from "drizzle-orm";
import {
  advanceScreeningRecruitingNodeTx,
  closeRecruitingRecordTx,
  RecruitingPipelineError,
  reopenRecruitingRecordTx,
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import type { RecruitingPipelineResult } from "@app/database/recruiting-pipeline";
import { reviewAiInterviewRoundTx } from "@app/database/recruiting-ai-review";
import { updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { recruitingEvent, recruitingNodeState, recruitingRecord } from "@app/db-schema/schema";
import { isHumanInterviewStage, isOfferStage } from "@app/shared/candidate-pipeline-machine";
import type { WorkspaceAuthorizer } from "../../../../../access/workspace-access-policy";
import { db } from "../../../../../../lib/server/db/index";
import { invalidateStudioInterviewCaches } from "../../../../../cache-tags";
import type { CandidateTransitionInput } from "./candidate-transition";

export type CandidateStageTransitionProvenance =
  | { kind: "manual" }
  | { kind: "workspace_recruiting_copilot"; proposalId: string; proposalTitle: string };
export type CandidateStageTransitionResult =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "invalid"; message: string }
  | { kind: "conflict"; message: string }
  | ({ kind: "noop" | "ok" } & RecruitingPipelineResult);
export interface CandidateStageTransitionDependencies {
  invalidateCaches: typeof invalidateStudioInterviewCaches;
  transaction: typeof db.transaction;
}
const defaultDependencies: CandidateStageTransitionDependencies = {
  invalidateCaches: invalidateStudioInterviewCaches,
  transaction: db.transaction.bind(db),
};
class CandidateStageTransitionForbiddenError extends Error {
  override name = "CandidateStageTransitionForbiddenError";
}

function requireHumanInterviewJob(jobDescriptionId: string | null) {
  if (!jobDescriptionId) {
    throw new RecruitingPipelineError("请先绑定在招岗位后再安排真人面试。", "invalid");
  }
}

export async function transitionCandidateStage(
  command: {
    authorize: WorkspaceAuthorizer;
    candidateId: string;
    input: CandidateTransitionInput;
    operatorId: string | null;
    organizationId: string;
    provenance: CandidateStageTransitionProvenance;
  },
  dependencies: CandidateStageTransitionDependencies = defaultDependencies,
): Promise<CandidateStageTransitionResult> {
  const { input } = command;
  let target = "closed";
  if (input.action === "update_node") {
    target = input.node;
  }
  if (
    input.action === "advance" ||
    input.action === "reopen" ||
    input.action === "screening_advance"
  ) {
    target = input.targetNode;
  }
  if (
    isHumanInterviewStage(target) &&
    !(await command.authorize({ action: "create", resource: "humanInterview" }))
  ) {
    return { kind: "forbidden" };
  }
  if (isOfferStage(target) && !(await command.authorize({ action: "create", resource: "offer" }))) {
    return { kind: "forbidden" };
  }
  try {
    const changed = await dependencies.transaction(async (tx) => {
      const base = {
        expectedVersion: input.expectedVersion,
        now: new Date(),
        operatorId: command.operatorId,
        organizationId: command.organizationId,
        recordId: command.candidateId,
      };
      const [record] = await tx
        .select()
        .from(recruitingRecord)
        .where(
          and(
            eq(recruitingRecord.id, command.candidateId),
            eq(recruitingRecord.organizationId, command.organizationId),
          ),
        )
        .for("update");
      if (!record) {
        throw new RecruitingPipelineError("招聘记录不存在。", "not_found");
      }
      if (isHumanInterviewStage(target)) {
        requireHumanInterviewJob(record.jobDescriptionId);
      }
      let result: RecruitingPipelineResult;
      if (input.action === "screening_advance") {
        result = await advanceScreeningRecruitingNodeTx(tx, { ...base, ...input });
      } else if (input.action === "advance") {
        result = await transitionRecruitingNodeTx(tx, { ...base, ...input });
        if (input.interviewQuestions !== undefined) {
          await updateRecruitingRecords(
            tx,
            and(
              eq(recruitingRecordReadModel.id, command.candidateId),
              eq(recruitingRecordReadModel.organizationId, command.organizationId),
            ),
            { interviewQuestions: input.interviewQuestions },
          );
        }
      } else if (input.action === "reopen") {
        result = await reopenRecruitingRecordTx(tx, { ...base, ...input });
      } else if (input.action === "close") {
        result = await closeRecruitingRecordTx(tx, { ...base, ...input });
      } else if (
        input.node === "ai_interview" &&
        (input.result === "pass" || input.result === "fail")
      ) {
        if (!input.effectiveAiRoundId) {
          throw new RecruitingPipelineError("请指定本次有效 AI 面试轮次。", "invalid");
        }
        result = await reviewAiInterviewRoundTx(tx, {
          ...base,
          outcome: input.result,
          reason: input.reason,
          roundId: input.effectiveAiRoundId,
        });
        if (input.result === "pass") {
          const [node] = await tx
            .select()
            .from(recruitingNodeState)
            .where(
              and(
                eq(recruitingNodeState.recruitingRecordId, command.candidateId),
                eq(recruitingNodeState.node, "ai_interview"),
              ),
            );
          // 同批多轮仍继续 AI；末轮确认与进入复试必须一起成功或回滚。
          if (node?.status === "completed" && node.result === "pass") {
            if (!(await command.authorize({ action: "create", resource: "humanInterview" }))) {
              throw new CandidateStageTransitionForbiddenError();
            }
            requireHumanInterviewJob(record.jobDescriptionId);
            result = await transitionRecruitingNodeTx(tx, {
              ...base,
              expectedVersion: result.version,
              reason: input.reason,
              targetNode: "second_interview",
            });
          }
        }
      } else {
        result = await updateRecruitingNodeTx(tx, {
          ...base,
          ...input,
          status: input.targetStatus,
        });
      }
      if (result.changed && command.provenance.kind === "workspace_recruiting_copilot") {
        await tx.insert(recruitingEvent).values({
          action: "candidate_transition",
          detail: {
            action: input.action,
            copilotActionProposalId: command.provenance.proposalId,
            copilotActionTitle: command.provenance.proposalTitle,
            source: command.provenance.kind,
          },
          id: crypto.randomUUID(),
          operatorId: command.operatorId,
          organizationId: command.organizationId,
          recruitingRecordId: command.candidateId,
        });
      }
      return result;
    });
    if (changed.changed) {
      dependencies.invalidateCaches(command.organizationId);
    }
    return { kind: changed.changed ? "ok" : "noop", ...changed };
  } catch (error) {
    if (error instanceof CandidateStageTransitionForbiddenError) {
      return { kind: "forbidden" };
    }
    if (!(error instanceof RecruitingPipelineError)) {
      throw error;
    }
    if (error.code === "not_found") {
      return { kind: "not_found" };
    }
    return { kind: error.code, message: error.message };
  }
}
