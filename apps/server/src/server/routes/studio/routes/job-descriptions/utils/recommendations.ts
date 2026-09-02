import { and, eq, inArray, ne } from "drizzle-orm";
import type {
  JobDescriptionTalentRecommendation,
  JobDescriptionTalentRecommendationResult,
} from "@app/shared/job-descriptions";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import { jobDescription, studioInterview } from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { QdrantResumeVectorStore } from "../../../../../../lib/server/qdrant/resume-vector-store";
import {
  embedResumeSemanticTexts,
  getResumeEmbeddingConfig,
  isResumeSemanticIndexEnabled,
} from "../../../../../../lib/server/resume-semantic/embedding";
import { getResumeSemanticIndexConfig } from "../../../../../../lib/server/resume-semantic/indexer";
import {
  SEARCH_LIMIT_BY_CHUNK,
  mergeVectorScores,
  weightedScore,
} from "../../../../../../lib/server/resume-semantic/scoring";
import type { VectorScores } from "../../../../../../lib/server/resume-semantic/scoring";
import { buildJobDescriptionSemanticTexts } from "../../../../../../lib/server/resume-semantic/text-builders";
import type {
  JobDescriptionSemanticInput,
  ResumeSemanticTextChunk,
} from "../../../../../../lib/server/resume-semantic/text-builders";
import type {
  ResumeEmbeddingChunk,
  ResumeVectorStore,
} from "../../../../../../lib/server/resume-semantic/vector-store";
import { buildMasteredSkills, buildProfileHighlights } from "../../resume-pool/dao";

export type RecommendJobDescription = JobDescriptionSemanticInput;

interface RecommendationCandidateRecord {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  createdAt: string;
  currentJobDescriptionId: string | null;
  currentJobDescriptionName: string | null;
  id: string;
  notes: string | null;
  resumeFileName: string | null;
  resumeParseStatus: "failed" | "processing" | "queued" | "ready" | "unparsed";
  resumeProfile: ResumeProfile | null;
  skillsNormalized: string[];
  targetRole: string | null;
}

export interface FacetSimilarity {
  resumeOverview?: number;
  skillRole?: number;
  workProject?: number;
}

export interface CoreRankedEntry {
  // 完整候选记录，供生产 DTO 复用
  candidate: RecommendationCandidateRecord;
  candidateId: string;
  score: number;
  similarity: FacetSimilarity;
}

export interface ScoreCoreResult {
  loadedIds: Set<string>;
  ranked: CoreRankedEntry[];
  retrievedIds: Set<string>;
}

export interface ScoreCoreInput {
  // 排除绑定该 JD 的候选，但豁免这些 id；不传=不因绑定排除
  excludeLinkedExceptIds?: Set<string>;
  jobDescription: RecommendJobDescription;
  organizationId: string;
}

interface RecommendCandidatesInput {
  excludeAlreadyLinked: boolean;
  jobDescription: RecommendJobDescription;
  limit: number;
  organizationId: string;
}

interface RecommendationDeps {
  embed: (input: {
    apiKey: string;
    baseUrl: string;
    chunks: ResumeSemanticTextChunk[];
    dimensions: number;
    model: string;
  }) => Promise<ResumeEmbeddingChunk[]>;
  embeddingConfig: ReturnType<typeof getResumeEmbeddingConfig>;
  enabled: boolean;
  loadCandidates: (
    organizationId: string,
    ids: string[],
  ) => Promise<RecommendationCandidateRecord[]>;
  vectorStore: ResumeVectorStore;
}

function normalizeSkill(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function findMatchedSkills(candidate: RecommendationCandidateRecord, jdText: string): string[] {
  const normalizedJd = normalizeSkill(jdText);
  const normalizedCandidateSkills = new Set(candidate.skillsNormalized.map(normalizeSkill));
  const profileSkills = candidate.resumeProfile?.skills ?? [];
  return [
    ...new Set(
      profileSkills
        .filter((skill) => {
          const normalized = normalizeSkill(skill);
          return normalizedCandidateSkills.has(normalized) && normalizedJd.includes(normalized);
        })
        .slice(0, 3),
    ),
  ];
}

function buildReasons(
  candidate: RecommendationCandidateRecord,
  scores: VectorScores,
  jdText: string,
): string[] {
  const reasons: string[] = [];
  if ((scores.skillRole ?? 0) >= 0.78) {
    reasons.push("技能与岗位要求相似");
  }
  if ((scores.workProject ?? 0) >= 0.75) {
    reasons.push("项目/职责经验匹配");
  }
  if ((scores.resumeOverview ?? 0) >= 0.72) {
    reasons.push("候选人整体画像匹配");
  }
  const matchedSkills = findMatchedSkills(candidate, jdText);
  if (matchedSkills.length > 0) {
    reasons.push(`命中技能：${matchedSkills.join("、")}`);
  }
  return reasons.slice(0, 4);
}

function toRecommendation(
  candidate: RecommendationCandidateRecord,
  scores: VectorScores,
  jdText: string,
): JobDescriptionTalentRecommendation {
  return {
    candidateEmail: candidate.candidateEmail,
    candidateName: candidate.candidateName,
    candidatePhone: candidate.candidatePhone,
    createdAt: candidate.createdAt,
    currentJobDescriptionId: candidate.currentJobDescriptionId,
    currentJobDescriptionName: candidate.currentJobDescriptionName,
    id: candidate.id,
    masteredSkills: buildMasteredSkills(candidate.resumeProfile),
    notes: candidate.notes,
    profileHighlights: buildProfileHighlights(candidate.resumeProfile),
    reasons: buildReasons(candidate, scores, jdText),
    resumeFileName: candidate.resumeFileName,
    resumeParseStatus: candidate.resumeParseStatus,
    score: weightedScore(scores),
    similarity: {
      resumeOverview: scores.resumeOverview,
      skillRole: scores.skillRole,
      workProject: scores.workProject,
    },
    targetRole: candidate.targetRole ?? candidate.resumeProfile?.targetRoles?.[0] ?? null,
    workYears: candidate.resumeProfile?.workYears ?? null,
  };
}

export async function scoreCandidatesForJobDescription(
  input: ScoreCoreInput,
  // oxlint-disable-next-line no-use-before-define -- default dependency factory stays below the public function.
  deps: RecommendationDeps = createDefaultRecommendationDeps(),
): Promise<ScoreCoreResult> {
  const chunks = buildJobDescriptionSemanticTexts(input.jobDescription);
  const embedded = await deps.embed({
    ...deps.embeddingConfig,
    chunks,
  });
  const resultGroups = await Promise.all(
    embedded.map((chunk) =>
      deps.vectorStore.searchSimilarResumes({
        chunkType: chunk.chunkType,
        embedding: chunk.embedding,
        limit: SEARCH_LIMIT_BY_CHUNK[chunk.chunkType],
        organizationId: input.organizationId,
        sourceTypes: ["studio_interview"],
      }),
    ),
  );
  const bySource = mergeVectorScores(resultGroups.flat(), "studio_interview");
  const retrievedIds = new Set(bySource.keys());
  const candidates = await deps.loadCandidates(input.organizationId, [...bySource.keys()]);
  const loadedIds = new Set(candidates.map((c) => c.id));
  const exempt = input.excludeLinkedExceptIds;
  const ranked = candidates
    .filter(
      (c) =>
        !(exempt && c.currentJobDescriptionId === input.jobDescription.id && !exempt.has(c.id)),
    )
    .flatMap((c): CoreRankedEntry[] => {
      const s = bySource.get(c.id);
      return s ? [{ candidate: c, candidateId: c.id, score: weightedScore(s), similarity: s }] : [];
    })
    .toSorted((a, b) => b.score - a.score);
  return { loadedIds, ranked, retrievedIds };
}

export async function recommendCandidatesForJobDescription(
  input: RecommendCandidatesInput,
  // oxlint-disable-next-line no-use-before-define -- default dependency factory stays below the public function.
  deps: RecommendationDeps = createDefaultRecommendationDeps(),
): Promise<JobDescriptionTalentRecommendationResult> {
  if (!deps.enabled) {
    return {
      candidates: [],
      diagnostics: { vectorHitCount: 0 },
      jobDescription: {
        id: input.jobDescription.id,
        name: input.jobDescription.name,
      },
      status: "disabled",
    };
  }

  await deps.vectorStore.ensureCollection();
  const core = await scoreCandidatesForJobDescription(
    {
      excludeLinkedExceptIds: input.excludeAlreadyLinked ? new Set<string>() : undefined,
      jobDescription: input.jobDescription,
      organizationId: input.organizationId,
    },
    deps,
  );
  const jdText = [input.jobDescription.name, input.jobDescription.prompt]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const recommendations = core.ranked
    .filter((r) => r.score >= 55)
    .slice(0, input.limit)
    .map((r) => toRecommendation(r.candidate, r.similarity, jdText));

  return {
    candidates: recommendations,
    diagnostics: { vectorHitCount: core.retrievedIds.size },
    jobDescription: {
      id: input.jobDescription.id,
      name: input.jobDescription.name,
    },
    status: "ready",
  };
}

export function createDefaultRecommendationDeps(): RecommendationDeps {
  const embeddingConfig = getResumeEmbeddingConfig();
  const semanticConfig = getResumeSemanticIndexConfig();
  return {
    embed: embedResumeSemanticTexts,
    embeddingConfig,
    enabled:
      isResumeSemanticIndexEnabled() &&
      Boolean(semanticConfig.qdrantUrl) &&
      Boolean(embeddingConfig.apiKey),
    // oxlint-disable-next-line no-use-before-define -- DAO loader is defined below to keep config wiring compact.
    loadCandidates: loadRecommendationCandidates,
    vectorStore: new QdrantResumeVectorStore({
      apiKey: semanticConfig.qdrantApiKey,
      collectionName: semanticConfig.qdrantCollectionName,
      dimensions: semanticConfig.dimensions,
      url: semanticConfig.qdrantUrl || "http://127.0.0.1:6333",
    }),
  };
}

// 生产默认排除已结束候选(pipelineStage='closed')；评测走 includeClosed=true
// 让 leave-one-out 反事实里的结束正例仍可加载打分(与 excludeLinkedExceptIds 豁免同理)。
export function recommendationCandidateWhere(
  organizationId: string,
  ids: string[],
  includeClosed: boolean,
) {
  return and(
    eq(studioInterview.organizationId, organizationId),
    inArray(studioInterview.id, ids),
    includeClosed ? undefined : ne(studioInterview.pipelineStage, "closed"),
  );
}

export async function loadRecommendationCandidates(
  organizationId: string,
  ids: string[],
  opts: { includeClosed?: boolean } = {},
): Promise<RecommendationCandidateRecord[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      currentJobDescriptionId: studioInterview.jobDescriptionId,
      currentJobDescriptionName: jobDescription.name,
      id: studioInterview.id,
      notes: studioInterview.notes,
      resumeFileName: studioInterview.resumeFileName,
      resumeParseStatus: studioInterview.resumeParseStatus,
      resumeProfile: studioInterview.resumeProfile,
      skillsNormalized: studioInterview.skillsNormalized,
      targetRole: studioInterview.targetRole,
    })
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .where(recommendationCandidateWhere(organizationId, ids, opts.includeClosed ?? false));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    skillsNormalized: row.skillsNormalized ?? [],
  }));
}
