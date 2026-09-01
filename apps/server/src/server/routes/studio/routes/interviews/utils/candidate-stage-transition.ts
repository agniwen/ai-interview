import { and, eq } from "drizzle-orm";
import type { WorkspaceAuthorizer } from "../../../../../access/workspace-access-policy";
import { db } from "../../../../../../lib/server/db/index";
import { invalidateStudioInterviewCaches } from "../../../../../cache-tags";
import {
  getHumanInterviewOfferReadinessError,
  loadHumanInterviewRoundReadiness,
} from "../dao/human-interview-rounds";
import { interviewAuditLog, studioInterview } from "@arc/db-schema/schema";
import type { JsonObject } from "@arc/db-schema/json";
import {
  getCandidateReactivationError,
  getCandidateStageTransitionError,
  resolveCandidateTransitionPatch,
} from "./candidate-transition";
import type { CandidateTransitionInput } from "./candidate-transition";

export type CandidateStageTransitionProvenance =
  | { kind: "manual" }
  | {
      kind: "workspace_recruiting_copilot";
      proposalId: string;
      proposalTitle: string;
    };

export type CandidateStageTransitionResult =
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "invalid"; message: string }
  | { kind: "noop" }
  | { kind: "ok" };

export interface CandidateStageTransitionDependencies {
  getReadinessError: typeof getHumanInterviewOfferReadinessError;
  invalidateCaches: typeof invalidateStudioInterviewCaches;
  loadReadiness: typeof loadHumanInterviewRoundReadiness;
  transaction: typeof db.transaction;
}

const defaultDependencies: CandidateStageTransitionDependencies = {
  getReadinessError: getHumanInterviewOfferReadinessError,
  invalidateCaches: invalidateStudioInterviewCaches,
  loadReadiness: loadHumanInterviewRoundReadiness,
  transaction: db.transaction.bind(db),
};

function resolveTargetStagePermission(target: CandidateTransitionInput["pipelineStage"]) {
  if (target === "human_interview") {
    return { action: "create", resource: "humanInterview" } as const;
  }
  if (target === "offer") {
    return { action: "create", resource: "offer" } as const;
  }
  return null;
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
  const targetPermission = resolveTargetStagePermission(command.input.pipelineStage);
  if (targetPermission && !(await command.authorize(targetPermission))) {
    return { kind: "forbidden" };
  }

  const now = new Date();
  const result = await dependencies.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        closedMeta: studioInterview.closedMeta,
        jobDescriptionId: studioInterview.jobDescriptionId,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, command.candidateId),
          eq(studioInterview.organizationId, command.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      return { kind: "not_found" } as const;
    }

    const reactivationError = getCandidateReactivationError({
      from: existing.pipelineStage,
      reactivationReason: command.input.reactivationReason,
      to: command.input.pipelineStage,
    });
    if (reactivationError) {
      return { kind: "invalid", message: reactivationError } as const;
    }

    let humanInterviewOfferReadinessError: string | null = null;
    let humanInterviewReadyForOffer = false;
    if (existing.pipelineStage === "human_interview" && command.input.pipelineStage === "offer") {
      const readiness = await dependencies.loadReadiness(
        command.candidateId,
        command.organizationId,
        tx,
      );
      humanInterviewOfferReadinessError = dependencies.getReadinessError(readiness);
      humanInterviewReadyForOffer = !humanInterviewOfferReadinessError;
    }
    const stageTransitionError = getCandidateStageTransitionError({
      from: existing.pipelineStage,
      hasJobDescription: Boolean(existing.jobDescriptionId),
      humanInterviewReadyForOffer,
      to: command.input.pipelineStage,
    });
    if (stageTransitionError) {
      return {
        kind: "invalid",
        message: humanInterviewOfferReadinessError ?? stageTransitionError,
      } as const;
    }

    if (
      existing.pipelineStage === command.input.pipelineStage &&
      existing.outcome === (command.input.outcome ?? "in_pipeline")
    ) {
      return { kind: "noop" } as const;
    }

    const transition = resolveCandidateTransitionPatch({
      existing,
      input: command.input,
      now,
    });
    if (command.input.interviewQuestions !== undefined) {
      transition.patch.interviewQuestions = command.input.interviewQuestions;
    }
    await tx
      .update(studioInterview)
      .set(transition.patch)
      .where(eq(studioInterview.id, command.candidateId));
    const provenanceDetail =
      command.provenance.kind === "workspace_recruiting_copilot"
        ? {
            copilotActionProposalId: command.provenance.proposalId,
            copilotActionTitle: command.provenance.proposalTitle,
            source: "workspace_recruiting_copilot" as const,
          }
        : {};
    const auditDetail: JsonObject = {
      ...transition.auditDetail,
      ...provenanceDetail,
    };
    if (command.input.interviewQuestions !== undefined) {
      auditDetail.interviewerReferenceQuestionCount = command.input.interviewQuestions.length;
    }
    await tx.insert(interviewAuditLog).values({
      action: "candidate_transition",
      createdAt: now,
      detail: auditDetail,
      id: crypto.randomUUID(),
      interviewRecordId: command.candidateId,
      operatorId: command.operatorId,
      organizationId: command.organizationId,
      scheduleEntryId: null,
    });
    return { kind: "ok" } as const;
  });

  if (result.kind === "ok") {
    dependencies.invalidateCaches(command.organizationId);
  }
  return result;
}
