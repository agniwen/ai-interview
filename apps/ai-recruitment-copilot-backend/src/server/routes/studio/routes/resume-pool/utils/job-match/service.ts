import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { hashJobDescriptionForSemanticIndex } from "@arc/ai-recruitment-copilot-backend/lib/server/jd-semantic/hash";
import { hashResumeProfileForSemanticIndex } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/profile-hash";
import { rankJobDescriptionsForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import {
  getMastraModelIdentifier,
  mastraModels,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import { listRecruitingJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { recommendJobDescriptionsForResume } from "../jd-recommendations";
import {
  jobDescription,
  mailIngestMessage,
  resumeJobMatchCandidate,
  resumeJobMatchRun,
  resumePoolEvent,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
} from "@arc/db-schema/schema";
import type { ResumeJobMatchJobSnapshot } from "@arc/db-schema/schema";
import type { JsonObject } from "@arc/db-schema/json";
import { runNewMailResumeJobMatch } from "./orchestrator";
import type { NewMailResumeJobMatchContext, ResumeJobMatchOutcome } from "./orchestrator";

const MATCHER_VERSION = "mail-resume-job-match-v1";
const PROMPT_VERSION = "mail-resume-job-rerank-v1";
const MATCH_MODEL_ID = getMastraModelIdentifier(mastraModels.structuredModel);

export interface MailResumeJobMatchServiceDependencies {
  listPublishedJobs: typeof listRecruitingJobDescriptions;
  rankCandidates: typeof rankJobDescriptionsForResume;
  recallCandidates: typeof recommendJobDescriptionsForResume;
}

const defaultServiceDependencies: MailResumeJobMatchServiceDependencies = {
  listPublishedJobs: listRecruitingJobDescriptions,
  rankCandidates: rankJobDescriptionsForResume,
  recallCandidates: recommendJobDescriptionsForResume,
};

interface MailMatchContext extends NewMailResumeJobMatchContext {
  mailMessageId: string | null;
}

function resolveExplicitSelectionMethod(
  explicitJobDescriptionId: string | null,
  jdBindStatus: "ambiguous" | "bound" | "fallback" | "unmatched" | null,
): MailMatchContext["explicitSelectionMethod"] {
  if (!explicitJobDescriptionId) {
    return null;
  }
  return jdBindStatus === "bound" ? "mail_subject_code_exact" : "account_fixed";
}

async function loadMailMatchContext(input: {
  batchItemId: string;
  organizationId: string;
  poolItemId: string;
}): Promise<MailMatchContext | null> {
  const [row] = await db
    .select({
      batchItemId: resumeUploadBatchItem.id,
      batchJobDescriptionId: resumeUploadBatch.jobDescriptionId,
      currentJobDescriptionId: resumePoolItem.jobDescriptionId,
      jdBindStatus: mailIngestMessage.jdBindStatus,
      jdMode: resumeUploadBatch.jdMode,
      jobMatchRequestedAt: resumeUploadBatch.jobMatchRequestedAt,
      mailMessageId: mailIngestMessage.id,
      organizationId: resumeUploadBatch.organizationId,
      poolItemId: resumePoolItem.id,
      resumeFileName: resumePoolItem.resumeFileName,
      resumeProfile: resumePoolItem.resumeProfile,
      sourceChannel: resumePoolItem.sourceChannel,
      subjectJobCodes: mailIngestMessage.extractedJobCodes,
    })
    .from(resumeUploadBatchItem)
    .innerJoin(resumeUploadBatch, eq(resumeUploadBatchItem.batchId, resumeUploadBatch.id))
    .innerJoin(resumePoolItem, eq(resumeUploadBatchItem.poolItemId, resumePoolItem.id))
    .leftJoin(mailIngestMessage, eq(mailIngestMessage.batchId, resumeUploadBatch.id))
    .where(
      and(
        eq(resumeUploadBatchItem.id, input.batchItemId),
        eq(resumeUploadBatch.organizationId, input.organizationId),
        eq(resumePoolItem.id, input.poolItemId),
      ),
    )
    .limit(1);

  if (!row?.jobMatchRequestedAt || row.sourceChannel !== "mail_ingest" || !row.resumeProfile) {
    return null;
  }

  const explicitJobDescriptionId = row.jdMode === "bind" ? row.batchJobDescriptionId : null;
  return {
    batchItemId: row.batchItemId,
    currentJobDescriptionId: row.currentJobDescriptionId,
    explicitJobDescriptionId,
    explicitSelectionMethod: resolveExplicitSelectionMethod(
      explicitJobDescriptionId,
      row.jdBindStatus,
    ),
    mailMessageId: row.mailMessageId,
    organizationId: row.organizationId,
    poolItemId: row.poolItemId,
    resumeFileName: row.resumeFileName,
    resumeProfile: row.resumeProfile,
    subjectJobCodes: row.subjectJobCodes ?? [],
  };
}

function snapshotJob(
  matchedJob: ResumeJobMatchOutcome["candidates"][number]["jobDescription"],
): ResumeJobMatchJobSnapshot {
  return {
    code: matchedJob.code,
    contentHash: hashJobDescriptionForSemanticIndex({
      departmentName: matchedJob.departmentName,
      id: matchedJob.id,
      name: matchedJob.name,
      prompt: matchedJob.prompt,
    }),
    departmentName: matchedJob.departmentName,
    id: matchedJob.id,
    name: matchedJob.name,
  };
}

function usesAiSelection(selectionMethod: ResumeJobMatchOutcome["selectionMethod"]): boolean {
  return (
    selectionMethod === "ai_full_list" ||
    selectionMethod === "ai_rerank" ||
    selectionMethod === "strong_signal_fallback" ||
    selectionMethod === "vector_fallback"
  );
}

export function resolveSelectedCandidateRank(outcome: ResumeJobMatchOutcome): number | null {
  if (!outcome.selectedJobDescriptionId) {
    return null;
  }
  const selectedCandidate = outcome.candidates.find(
    (candidate) => candidate.jobDescriptionId === outcome.selectedJobDescriptionId,
  );
  return selectedCandidate?.aiRank ?? selectedCandidate?.recallRank ?? null;
}

/* oxlint-disable complexity -- one transaction owns the idempotent run, candidates, guarded binding, and event history. */
async function persistMatchOutcome(
  context: MailMatchContext,
  outcome: ResumeJobMatchOutcome,
): Promise<void> {
  const now = new Date();
  const usedAi = usesAiSelection(outcome.selectionMethod);
  const staleSelectedJob = await db.transaction(async (tx) => {
    const [existingRun] = await tx
      .select({ id: resumeJobMatchRun.id })
      .from(resumeJobMatchRun)
      .where(
        and(
          eq(resumeJobMatchRun.poolItemId, context.poolItemId),
          eq(resumeJobMatchRun.batchItemId, context.batchItemId),
          eq(resumeJobMatchRun.matcherVersion, MATCHER_VERSION),
        ),
      )
      .limit(1);
    const desiredRunId = existingRun?.id ?? crypto.randomUUID();
    const resumeInputHash = hashResumeProfileForSemanticIndex(context.resumeProfile);
    const [upsertedRun] = await tx
      .insert(resumeJobMatchRun)
      .values({
        batchItemId: context.batchItemId,
        completedAt: now,
        createdAt: now,
        errorMessage: outcome.errorMessage ?? null,
        id: desiredRunId,
        mailMessageId: context.mailMessageId,
        matcherVersion: MATCHER_VERSION,
        model: usedAi ? MATCH_MODEL_ID : null,
        organizationId: context.organizationId,
        poolItemId: context.poolItemId,
        promptVersion: usedAi ? PROMPT_VERSION : null,
        resumeInputHash,
        selectedJobDescriptionId: outcome.selectedJobDescriptionId,
        selectionMethod: outcome.selectionMethod,
        status: outcome.status,
      })
      .onConflictDoUpdate({
        set: {
          completedAt: now,
          errorMessage: outcome.errorMessage ?? null,
          mailMessageId: context.mailMessageId,
          model: usedAi ? MATCH_MODEL_ID : null,
          promptVersion: usedAi ? PROMPT_VERSION : null,
          resumeInputHash,
          selectedJobDescriptionId: outcome.selectedJobDescriptionId,
          selectionMethod: outcome.selectionMethod,
          status: outcome.status,
        },
        target: [
          resumeJobMatchRun.poolItemId,
          resumeJobMatchRun.batchItemId,
          resumeJobMatchRun.matcherVersion,
        ],
      })
      .returning({ id: resumeJobMatchRun.id });
    if (!upsertedRun) {
      throw new Error("岗位匹配结果写入失败");
    }
    const runId = upsertedRun.id;
    const insertedRun = !existingRun && runId === desiredRunId;

    const candidateIds = outcome.candidates.map((candidate) => candidate.jobDescriptionId);
    let existingCandidateRows: { id: string }[] = [];
    if (candidateIds.length > 0) {
      existingCandidateRows = await tx
        .select({ id: jobDescription.id })
        .from(jobDescription)
        .where(inArray(jobDescription.id, candidateIds));
    }
    const existingCandidateIds = new Set(existingCandidateRows.map((row) => row.id));
    await tx.delete(resumeJobMatchCandidate).where(eq(resumeJobMatchCandidate.runId, runId));
    if (outcome.candidates.length > 0) {
      await tx.insert(resumeJobMatchCandidate).values(
        outcome.candidates.map((candidate) => ({
          aiRank: candidate.aiRank,
          aiReason: candidate.aiReason,
          aiScore: candidate.aiScore,
          id: crypto.randomUUID(),
          jobDescriptionId: existingCandidateIds.has(candidate.jobDescriptionId)
            ? candidate.jobDescriptionId
            : null,
          jobSnapshot: snapshotJob(candidate.jobDescription),
          overviewScore: candidate.overviewScore,
          recallRank: candidate.recallRank,
          recallSource: candidate.recallSource,
          runId,
          skillRoleScore: candidate.skillRoleScore,
          vectorScore: candidate.vectorScore,
          workProjectScore: candidate.workProjectScore,
        })),
      );
    }

    if (!outcome.selectedJobDescriptionId || outcome.status !== "succeeded") {
      return false;
    }
    const [selectedJob] = await tx
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, outcome.selectedJobDescriptionId),
          eq(jobDescription.organizationId, context.organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .limit(1);
    if (!selectedJob) {
      await tx
        .update(resumeJobMatchRun)
        .set({ errorMessage: "选中岗位已停止招聘，请重试匹配。", status: "failed" })
        .where(eq(resumeJobMatchRun.id, runId));
      return true;
    }
    const [current] = await tx
      .select({ jobDescriptionId: resumePoolItem.jobDescriptionId })
      .from(resumePoolItem)
      .where(
        and(
          eq(resumePoolItem.id, context.poolItemId),
          eq(resumePoolItem.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    let wasBoundNow = false;
    if (current?.jobDescriptionId === null) {
      const updated = await tx
        .update(resumePoolItem)
        .set({ jobDescriptionId: outcome.selectedJobDescriptionId, updatedAt: now })
        .where(
          and(
            eq(resumePoolItem.id, context.poolItemId),
            eq(resumePoolItem.organizationId, context.organizationId),
            isNull(resumePoolItem.jobDescriptionId),
          ),
        )
        .returning({ id: resumePoolItem.id });
      wasBoundNow = updated.length > 0;
    }
    const [afterBinding] = await tx
      .select({ jobDescriptionId: resumePoolItem.jobDescriptionId })
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, context.poolItemId))
      .limit(1);
    if (afterBinding?.jobDescriptionId !== outcome.selectedJobDescriptionId) {
      await tx
        .update(resumeJobMatchRun)
        .set({ status: "superseded" })
        .where(eq(resumeJobMatchRun.id, runId));
      return false;
    }
    const wasPreboundByMail =
      insertedRun && context.explicitJobDescriptionId === outcome.selectedJobDescriptionId;
    if (wasBoundNow || wasPreboundByMail) {
      const payload: JsonObject = {
        bindingMode: "automatic",
        fromJobDescriptionId:
          context.explicitJobDescriptionId === outcome.selectedJobDescriptionId
            ? null
            : (current?.jobDescriptionId ?? null),
        matchRunId: runId,
        selectedCandidateRank: resolveSelectedCandidateRank(outcome),
        selectionMethod: outcome.selectionMethod,
        source: "auto_match",
        toJobDescriptionId: outcome.selectedJobDescriptionId,
      };
      await tx.insert(resumePoolEvent).values({
        actorId: null,
        createdAt: now,
        id: crypto.randomUUID(),
        organizationId: context.organizationId,
        payload,
        poolItemId: context.poolItemId,
        type: "bound",
      });
    }
    return false;
  });
  if (staleSelectedJob) {
    throw new Error("选中岗位已停止招聘，请重试匹配。");
  }
}

export async function matchNewMailResumePoolItem(
  input: {
    batchItemId: string;
    organizationId: string;
    poolItemId: string;
  },
  dependencies: MailResumeJobMatchServiceDependencies = defaultServiceDependencies,
): Promise<{
  handled: boolean;
  jobDescriptionId: string | null;
}> {
  const context = await loadMailMatchContext(input);
  if (!context) {
    return { handled: false, jobDescriptionId: null };
  }
  await runNewMailResumeJobMatch(context, {
    listPublishedJobs: dependencies.listPublishedJobs,
    persistOutcome: (outcome) => persistMatchOutcome(context, outcome),
    rankCandidates: dependencies.rankCandidates,
    recallCandidates: dependencies.recallCandidates,
  });
  const [poolItem] = await db
    .select({ jobDescriptionId: resumePoolItem.jobDescriptionId })
    .from(resumePoolItem)
    .where(
      and(
        eq(resumePoolItem.id, context.poolItemId),
        eq(resumePoolItem.organizationId, context.organizationId),
      ),
    )
    .limit(1);
  return { handled: true, jobDescriptionId: poolItem?.jobDescriptionId ?? null };
}
