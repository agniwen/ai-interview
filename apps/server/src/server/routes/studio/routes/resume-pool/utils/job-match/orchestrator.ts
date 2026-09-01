import type {
  JobDescriptionListRecord,
  JobDescriptionRecommendationResult,
} from "@arc/shared/job-descriptions";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type {
  ResumeJobMatchRecallSource,
  ResumeJobMatchRunStatus,
  ResumeJobMatchSelectionMethod,
} from "@arc/db-schema/schema";
import type { JobDescriptionRankingResult } from "../../../../../../agents/job-description-match-agent";
import {
  matchPublishedJobFromResumeFileName,
  matchPublishedJobsFromResumeFileNameCore,
  matchPublishedJobsFromTargetRoles,
} from "./filename-match";

const MAX_VECTOR_CANDIDATES = 10;

export interface NewMailResumeJobMatchContext {
  batchItemId: string;
  currentJobDescriptionId: string | null;
  explicitJobDescriptionId: string | null;
  explicitSelectionMethod: Extract<
    ResumeJobMatchSelectionMethod,
    "account_fixed" | "mail_subject_code_exact"
  > | null;
  organizationId: string;
  poolItemId: string;
  resumeFileName: string | null;
  resumeProfile: ResumeProfile;
  subjectJobCodes?: readonly string[];
}

export interface ResumeJobMatchCandidateOutcome {
  aiRank: number | null;
  aiReason: string | null;
  aiScore: number | null;
  jobDescription: JobDescriptionListRecord;
  jobDescriptionId: string;
  overviewScore: number | null;
  recallRank: number;
  recallSource: ResumeJobMatchRecallSource;
  skillRoleScore: number | null;
  vectorScore: number | null;
  workProjectScore: number | null;
}

export interface ResumeJobMatchOutcome {
  candidates: ResumeJobMatchCandidateOutcome[];
  errorMessage?: string;
  selectedJobDescriptionId: string | null;
  selectionMethod: ResumeJobMatchSelectionMethod | null;
  status: ResumeJobMatchRunStatus;
}

export interface NewMailResumeJobMatchDependencies {
  listPublishedJobs: (organizationId: string) => Promise<JobDescriptionListRecord[]>;
  persistOutcome: (outcome: ResumeJobMatchOutcome) => Promise<void>;
  rankCandidates: (
    profile: ResumeProfile,
    candidates: JobDescriptionListRecord[],
    options: {
      recallSources: ReadonlyMap<string, ResumeJobMatchRecallSource>;
      resumeFileName: string | null;
      vectorScores: ReadonlyMap<
        string,
        {
          score: number;
          similarity: {
            resumeOverview?: number;
            skillRole?: number;
            workProject?: number;
          };
        }
      >;
    },
  ) => Promise<JobDescriptionRankingResult | null>;
  recallCandidates: (input: {
    minimumScore?: number;
    organizationId: string;
    resume: { id: string; jobDescriptionId: null; profile: ResumeProfile };
    topN: number;
  }) => Promise<JobDescriptionRecommendationResult>;
}

function baseCandidate(
  jobDescription: JobDescriptionListRecord,
  recallRank: number,
  recallSource: ResumeJobMatchRecallSource,
): ResumeJobMatchCandidateOutcome {
  return {
    aiRank: null,
    aiReason: null,
    aiScore: null,
    jobDescription,
    jobDescriptionId: jobDescription.id,
    overviewScore: null,
    recallRank,
    recallSource,
    skillRoleScore: null,
    vectorScore: null,
    workProjectScore: null,
  };
}

function buildVectorCandidates(
  jobsById: ReadonlyMap<string, JobDescriptionListRecord>,
  recalled: JobDescriptionRecommendationResult["recommendations"],
): ResumeJobMatchCandidateOutcome[] {
  return recalled.flatMap((recommendation, index) => {
    const jobDescription = jobsById.get(recommendation.id);
    if (!jobDescription) {
      return [];
    }
    return [
      {
        ...baseCandidate(jobDescription, index + 1, "vector"),
        overviewScore: recommendation.similarity.resumeOverview ?? null,
        skillRoleScore: recommendation.similarity.skillRole ?? null,
        vectorScore: recommendation.score,
        workProjectScore: recommendation.similarity.workProject ?? null,
      },
    ];
  });
}

function applyAiRanking(
  candidates: ResumeJobMatchCandidateOutcome[],
  ranking: JobDescriptionRankingResult,
): ResumeJobMatchCandidateOutcome[] {
  const rankedById = new Map(
    ranking.candidates.map((candidate) => [candidate.jobDescriptionId, candidate]),
  );
  return candidates
    .map((candidate) => {
      const ranked = rankedById.get(candidate.jobDescriptionId);
      return ranked
        ? {
            ...candidate,
            aiRank: ranked.rank,
            aiReason: ranked.reason,
            aiScore: ranked.matchScore,
          }
        : candidate;
    })
    .toSorted((left, right) => (left.aiRank ?? Infinity) - (right.aiRank ?? Infinity));
}

function vectorScoreMap(candidates: ResumeJobMatchCandidateOutcome[]) {
  return new Map(
    candidates.flatMap((candidate) =>
      candidate.vectorScore === null
        ? []
        : [
            [
              candidate.jobDescriptionId,
              {
                score: candidate.vectorScore,
                similarity: {
                  resumeOverview: candidate.overviewScore ?? undefined,
                  skillRole: candidate.skillRoleScore ?? undefined,
                  workProject: candidate.workProjectScore ?? undefined,
                },
              },
            ] as const,
          ],
    ),
  );
}

function strongRecallSource(
  jobDescriptionId: string,
  subjectCandidateIds: readonly string[],
  targetRoleExactCandidateIds: ReadonlySet<string>,
  targetRoleCoreCandidateIds: ReadonlySet<string>,
  filenameCandidateIds: ReadonlySet<string>,
  fallback: ResumeJobMatchRecallSource,
): ResumeJobMatchRecallSource {
  if (subjectCandidateIds.includes(jobDescriptionId)) {
    return "subject_code";
  }
  if (targetRoleExactCandidateIds.has(jobDescriptionId)) {
    return "target_role_exact";
  }
  if (targetRoleCoreCandidateIds.has(jobDescriptionId)) {
    return "target_role_core";
  }
  if (filenameCandidateIds.has(jobDescriptionId)) {
    return "filename";
  }
  return fallback;
}

const FALLBACK_SOURCE_PRIORITY = {
  account_fixed: 0,
  ai_full_list: 5,
  filename: 3,
  subject_code: 0,
  target_role: 2,
  target_role_core: 2,
  target_role_exact: 1,
  vector: 4,
} satisfies Record<ResumeJobMatchRecallSource, number>;

function selectFallbackCandidate(candidates: ResumeJobMatchCandidateOutcome[]) {
  return candidates.toSorted((left, right) => {
    const sourceDifference =
      FALLBACK_SOURCE_PRIORITY[left.recallSource] - FALLBACK_SOURCE_PRIORITY[right.recallSource];
    if (sourceDifference !== 0) {
      return sourceDifference;
    }
    const vectorDifference = (right.vectorScore ?? -Infinity) - (left.vectorScore ?? -Infinity);
    return vectorDifference || left.recallRank - right.recallRank;
  })[0];
}

async function rankAndPersist(
  context: NewMailResumeJobMatchContext,
  candidates: ResumeJobMatchCandidateOutcome[],
  selectionMethod: Extract<ResumeJobMatchSelectionMethod, "ai_full_list" | "ai_rerank">,
  dependencies: NewMailResumeJobMatchDependencies,
): Promise<void> {
  let ranking: JobDescriptionRankingResult;
  try {
    const result = await dependencies.rankCandidates(
      context.resumeProfile,
      candidates.map((candidate) => candidate.jobDescription),
      {
        recallSources: new Map(
          candidates.map((candidate) => [candidate.jobDescriptionId, candidate.recallSource]),
        ),
        resumeFileName: context.resumeFileName,
        vectorScores: vectorScoreMap(candidates),
      },
    );
    if (!result) {
      throw new Error("AI 岗位精排未返回结果");
    }
    ranking = result;
  } catch (error) {
    const fallbackCandidate = selectFallbackCandidate(candidates);
    const canUseFallback =
      fallbackCandidate &&
      (fallbackCandidate.recallSource !== "ai_full_list" || fallbackCandidate.vectorScore !== null);
    if (canUseFallback) {
      const isStrongSignal =
        fallbackCandidate.recallSource !== "vector" &&
        fallbackCandidate.recallSource !== "ai_full_list";
      return dependencies.persistOutcome({
        candidates,
        errorMessage: error instanceof Error ? error.message : String(error),
        selectedJobDescriptionId: fallbackCandidate.jobDescriptionId,
        selectionMethod: isStrongSignal ? "strong_signal_fallback" : "vector_fallback",
        status: "succeeded",
      });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    await dependencies.persistOutcome({
      candidates,
      errorMessage,
      selectedJobDescriptionId: null,
      selectionMethod,
      status: "failed",
    });
    throw error;
  }
  return dependencies.persistOutcome({
    candidates: applyAiRanking(candidates, ranking),
    selectedJobDescriptionId: ranking.selectedJobDescriptionId,
    selectionMethod,
    status: "succeeded",
  });
}

export async function runNewMailResumeJobMatch(
  context: NewMailResumeJobMatchContext,
  dependencies: NewMailResumeJobMatchDependencies,
): Promise<void> {
  const publishedJobs = await dependencies.listPublishedJobs(context.organizationId);
  const jobsById = new Map(
    publishedJobs.map((jobDescription) => [jobDescription.id, jobDescription]),
  );
  const subjectCodes = new Set(
    (context.subjectJobCodes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean),
  );
  const subjectCandidateIds = publishedJobs
    .filter((jobDescription) => {
      const normalizedCode = jobDescription.code?.trim().toUpperCase();
      return normalizedCode ? subjectCodes.has(normalizedCode) : false;
    })
    .map((jobDescription) => jobDescription.id);

  if (publishedJobs.length === 0) {
    return dependencies.persistOutcome({
      candidates: [],
      selectedJobDescriptionId: null,
      selectionMethod: null,
      status: "no_candidates",
    });
  }

  const accountFixedJobMustYieldToAmbiguousSubjectCodes =
    context.explicitSelectionMethod === "account_fixed" && subjectCandidateIds.length > 1;
  if (
    context.explicitJobDescriptionId &&
    context.explicitSelectionMethod &&
    !accountFixedJobMustYieldToAmbiguousSubjectCodes
  ) {
    const explicitJob = jobsById.get(context.explicitJobDescriptionId);
    if (explicitJob) {
      const recallSource =
        context.explicitSelectionMethod === "mail_subject_code_exact"
          ? "subject_code"
          : "account_fixed";
      return dependencies.persistOutcome({
        candidates: [baseCandidate(explicitJob, 1, recallSource)],
        selectedJobDescriptionId: explicitJob.id,
        selectionMethod: context.explicitSelectionMethod,
        status: "succeeded",
      });
    }
  }

  const [uniqueSubjectJobId] = subjectCandidateIds;
  if (subjectCandidateIds.length === 1 && uniqueSubjectJobId) {
    const subjectJob = jobsById.get(uniqueSubjectJobId);
    if (subjectJob) {
      return dependencies.persistOutcome({
        candidates: [baseCandidate(subjectJob, 1, "subject_code")],
        selectedJobDescriptionId: subjectJob.id,
        selectionMethod: "mail_subject_code_exact",
        status: "succeeded",
      });
    }
  }

  const filenameMatch = matchPublishedJobFromResumeFileName(context.resumeFileName, publishedJobs);
  if (filenameMatch.status === "exact" && subjectCandidateIds.length === 0) {
    const matchedJob = jobsById.get(filenameMatch.jobDescriptionId);
    if (matchedJob) {
      return dependencies.persistOutcome({
        candidates: [baseCandidate(matchedJob, 1, "filename")],
        selectedJobDescriptionId: matchedJob.id,
        selectionMethod: "filename_exact",
        status: "succeeded",
      });
    }
  }

  const targetRoleMatches = matchPublishedJobsFromTargetRoles(
    context.resumeProfile.targetRoles,
    publishedJobs,
  );
  const targetRoleExactCandidateIds = new Set(targetRoleMatches.exactIds);
  const targetRoleCoreCandidateIds = new Set(targetRoleMatches.coreIds);
  const filenameCandidateIds = new Set([
    ...(filenameMatch.status === "exact" ? [filenameMatch.jobDescriptionId] : []),
    ...(filenameMatch.status === "ambiguous" ? filenameMatch.jobDescriptionIds : []),
    ...matchPublishedJobsFromResumeFileNameCore(context.resumeFileName, publishedJobs),
  ]);

  const recallResult = await dependencies.recallCandidates({
    minimumScore: 0,
    organizationId: context.organizationId,
    resume: { id: context.poolItemId, jobDescriptionId: null, profile: context.resumeProfile },
    topN: MAX_VECTOR_CANDIDATES,
  });

  if (recallResult.status === "ready" && recallResult.recommendations.length > 0) {
    const vectorCandidates = buildVectorCandidates(jobsById, recallResult.recommendations).map(
      (candidate) => ({
        ...candidate,
        recallSource: strongRecallSource(
          candidate.jobDescriptionId,
          subjectCandidateIds,
          targetRoleExactCandidateIds,
          targetRoleCoreCandidateIds,
          filenameCandidateIds,
          candidate.recallSource,
        ),
      }),
    );
    const seenStrongIds = new Set<string>();
    const strongCandidates = [
      ...subjectCandidateIds.map((id) => ({ id, source: "subject_code" as const })),
      ...targetRoleExactCandidateIds
        .values()
        .map((id) => ({ id, source: "target_role_exact" as const })),
      ...targetRoleCoreCandidateIds
        .values()
        .map((id) => ({ id, source: "target_role_core" as const })),
      ...filenameCandidateIds.values().map((id) => ({ id, source: "filename" as const })),
    ].flatMap(({ id, source }, index) => {
      if (
        seenStrongIds.has(id) ||
        vectorCandidates.some((candidate) => candidate.jobDescriptionId === id)
      ) {
        return [];
      }
      seenStrongIds.add(id);
      const jobDescription = jobsById.get(id);
      return jobDescription ? [baseCandidate(jobDescription, index + 1, source)] : [];
    });
    const candidates = [...strongCandidates, ...vectorCandidates].map((candidate, index) => ({
      ...candidate,
      recallRank: index + 1,
    }));
    if (candidates.length > 0) {
      return rankAndPersist(context, candidates, "ai_rerank", dependencies);
    }
  }

  const allCandidates = publishedJobs.map((jobDescription, index) =>
    baseCandidate(
      jobDescription,
      index + 1,
      strongRecallSource(
        jobDescription.id,
        subjectCandidateIds,
        targetRoleExactCandidateIds,
        targetRoleCoreCandidateIds,
        filenameCandidateIds,
        "ai_full_list",
      ),
    ),
  );
  return rankAndPersist(context, allCandidates, "ai_full_list", dependencies);
}
