import { and, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { jobDescription, resumePoolItem, studioInterview, user } from "@arc/db-schema/schema";
import type { ResumePoolScope, ResumeSemanticSourceType } from "@arc/db-schema/schema";
import { getCandidateActivityStatus } from "@arc/shared/candidate-pipeline-machine";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { buildResumeProfileSnapshotFromProfile } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resume-profile-snapshot";
import { QdrantResumeVectorStore } from "../qdrant/resume-vector-store";
import {
  embedResumeSemanticTexts,
  getResumeEmbeddingConfig,
  isResumeSemanticIndexEnabled,
} from "./embedding";
import { getResumeSemanticIndexConfig } from "./indexer";
import { rerankResumeDuplicate } from "./rerank";
import type { VectorSimilarityScores } from "./rerank";
import { buildResumeSemanticTexts } from "./text-builders";
import type { ResumeVectorSearchResult, ResumeVectorStore } from "./vector-store";

interface SemanticCandidateRecord {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  createdAt: string;
  id: string;
  jobDescriptionName: string | null;
  resumeProfile: ResumeProfile | null;
  sourceType?: ResumeSemanticSourceType;
  status: DedupMatchRecord["status"];
  targetRole: string | null;
  uploaderImage?: string | null;
  uploaderName?: string | null;
}

interface FindSemanticResumeDuplicatesInput {
  excludeSources?: { sourceId: string; sourceType: ResumeSemanticSourceType }[];
  email?: string | null;
  name?: string | null;
  organizationId: string;
  phone?: string | null;
  poolOwnerUserId?: string | null;
  poolScope?: ResumePoolScope | null;
  resumeProfile?: ResumeProfile | null;
  sourceTypes?: ResumeSemanticSourceType[];
  throwOnError?: boolean;
}

interface SemanticDedupDeps {
  embed: typeof embedResumeSemanticTexts;
  embeddingConfig: ReturnType<typeof getResumeEmbeddingConfig>;
  enabled: boolean;
  loadCandidates: (
    organizationId: string,
    sources: { sourceId: string; sourceType: ResumeSemanticSourceType }[],
    options?: { poolOwnerUserId?: string | null; poolScope?: ResumePoolScope | null },
  ) => Promise<SemanticCandidateRecord[]>;
  vectorStore: ResumeVectorStore;
}

function sourceKey(sourceType: ResumeSemanticSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function toSimilarity(scores: VectorSimilarityScores): DedupMatchRecord["similarity"] {
  return {
    resumeOverview: scores.resumeOverview,
    skillRole: scores.skillRole,
    workProject: scores.workProject,
  };
}

function mergeVectorScores(
  results: ResumeVectorSearchResult[],
  allowedSourceTypes: ResumeSemanticSourceType[],
  excludeSources: { sourceId: string; sourceType: ResumeSemanticSourceType }[] = [],
): Map<string, VectorSimilarityScores> {
  const map = new Map<string, VectorSimilarityScores>();
  const allowed = new Set(allowedSourceTypes);
  const excluded = new Set(
    excludeSources.map((source) => sourceKey(source.sourceType, source.sourceId)),
  );
  for (const result of results) {
    const key = sourceKey(result.sourceType, result.sourceId);
    if (!(allowed.has(result.sourceType) && !excluded.has(key))) {
      continue;
    }
    const current = map.get(key) ?? {};
    if (result.chunkType === "resume_overview") {
      current.resumeOverview = Math.max(current.resumeOverview ?? 0, result.score);
    } else if (result.chunkType === "work_project") {
      current.workProject = Math.max(current.workProject ?? 0, result.score);
    } else if (result.chunkType === "skill_role") {
      current.skillRole = Math.max(current.skillRole ?? 0, result.score);
    }
    map.set(key, current);
  }
  return map;
}

export async function findSemanticResumeDuplicates(
  input: FindSemanticResumeDuplicatesInput,
  // oxlint-disable-next-line no-use-before-define -- default dependency factory stays below the public function.
  deps: SemanticDedupDeps = createDefaultSemanticDedupDeps(),
): Promise<DedupMatchRecord[]> {
  if (!(deps.enabled && input.resumeProfile)) {
    console.info("[resume-semantic-dedup] skipped", {
      enabled: deps.enabled,
      hasResumeProfile: Boolean(input.resumeProfile),
      organizationId: input.organizationId,
    });
    return [];
  }
  const queryProfile = input.resumeProfile;
  const sourceTypes = input.sourceTypes?.length ? input.sourceTypes : ["studio_interview" as const];

  try {
    const chunks = buildResumeSemanticTexts(queryProfile);
    const embedded = await deps.embed({
      ...deps.embeddingConfig,
      chunks,
    });
    await deps.vectorStore.ensureCollection();
    const searchResultGroups = await Promise.all(
      embedded.map((chunk) =>
        deps.vectorStore.searchSimilarResumes({
          chunkType: chunk.chunkType,
          embedding: chunk.embedding,
          limit: chunk.chunkType === "skill_role" ? 30 : 50,
          organizationId: input.organizationId,
          sourceTypes,
        }),
      ),
    );
    const searchResults = searchResultGroups.flat();
    const bySource = mergeVectorScores(searchResults, sourceTypes, input.excludeSources);
    const sources = [...bySource.keys()].map((key) => {
      const [sourceType, sourceId] = key.split(":");
      return { sourceId, sourceType: sourceType as ResumeSemanticSourceType };
    });
    const candidates = await deps.loadCandidates(input.organizationId, sources, {
      poolOwnerUserId: input.poolOwnerUserId,
      poolScope: input.poolScope,
    });
    const semanticMatches = candidates.flatMap((candidate): DedupMatchRecord[] => {
      const candidateSourceType = candidate.sourceType ?? "studio_interview";
      const vectorScores = bySource.get(sourceKey(candidateSourceType, candidate.id));
      if (!vectorScores) {
        return [];
      }
      const rerank = rerankResumeDuplicate({
        candidateProfile: candidate.resumeProfile,
        queryProfile,
        vectorScores,
      });
      if (rerank.level === "low") {
        return [];
      }
      return [
        {
          candidateEmail: candidate.candidateEmail,
          candidateName: candidate.candidateName,
          candidatePhone: candidate.candidatePhone,
          conflictingSignals: rerank.conflictingSignals,
          createdAt: candidate.createdAt,
          id: candidate.id,
          jobDescriptionName: candidate.jobDescriptionName,
          level: rerank.level,
          resumeProfileSnapshot: buildResumeProfileSnapshotFromProfile(candidate.resumeProfile),
          score: rerank.score,
          semanticReasons: rerank.reasons,
          similarity: toSimilarity(vectorScores),
          skills: (candidate.resumeProfile?.skills ?? [])
            .map((skill) => skill.trim())
            .filter((skill) => skill && skill !== "未发现信息")
            .filter((skill, index, all) => all.indexOf(skill) === index)
            .slice(0, 12),
          sourceType: candidateSourceType,
          status: candidate.status,
          targetRole: candidate.targetRole,
          uploaderImage: candidate.uploaderImage,
          uploaderName: candidate.uploaderName,
        },
      ];
    });
    const matches = semanticMatches
      .toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10);
    console.info("[resume-semantic-dedup] completed", {
      candidateCount: candidates.length,
      matchCount: matches.length,
      matches: matches.map((match) => ({
        id: match.id,
        level: match.level,
        score: match.score,
        semanticReasons: match.semanticReasons,
        similarity: match.similarity,
      })),
      organizationId: input.organizationId,
      vectorHitCount: bySource.size,
    });
    return matches;
  } catch (error) {
    console.warn("[resume-semantic-dedup] semantic dedup failed", error);
    if (input.throwOnError) {
      throw error;
    }
    return [];
  }
}

export function createDefaultSemanticDedupDeps(): SemanticDedupDeps {
  const embeddingConfig = getResumeEmbeddingConfig();
  const semanticConfig = getResumeSemanticIndexConfig();
  return {
    embed: embedResumeSemanticTexts,
    embeddingConfig,
    enabled: isResumeSemanticIndexEnabled() && Boolean(semanticConfig.qdrantUrl),
    // oxlint-disable-next-line no-use-before-define -- DAO loader is defined below to keep config wiring compact.
    loadCandidates: loadSemanticDedupCandidates,
    vectorStore: new QdrantResumeVectorStore({
      apiKey: semanticConfig.qdrantApiKey,
      collectionName: semanticConfig.qdrantCollectionName,
      dimensions: semanticConfig.dimensions,
      url: semanticConfig.qdrantUrl || "http://127.0.0.1:6333",
    }),
  };
}

async function loadSemanticDedupCandidates(
  organizationId: string,
  sources: { sourceId: string; sourceType: ResumeSemanticSourceType }[],
  options: { poolOwnerUserId?: string | null; poolScope?: ResumePoolScope | null } = {},
): Promise<SemanticCandidateRecord[]> {
  if (sources.length === 0) {
    return [];
  }
  const studioIds = sources
    .filter((source) => source.sourceType === "studio_interview")
    .map((source) => source.sourceId);
  const poolIds = sources
    .filter((source) => source.sourceType === "resume_pool_item")
    .map((source) => source.sourceId);

  const studioRows =
    studioIds.length === 0
      ? []
      : await db
          .select({
            candidateEmail: studioInterview.candidateEmail,
            candidateName: studioInterview.candidateName,
            candidatePhone: studioInterview.candidatePhone,
            createdAt: studioInterview.createdAt,
            id: studioInterview.id,
            jobDescriptionName: jobDescription.name,
            pipelineStage: studioInterview.pipelineStage,
            resumeProfile: studioInterview.resumeProfile,
            targetRole: studioInterview.targetRole,
            uploaderImage: user.image,
            uploaderName: user.name,
          })
          .from(studioInterview)
          .leftJoin(user, eq(studioInterview.createdBy, user.id))
          .leftJoin(
            jobDescription,
            and(
              eq(studioInterview.jobDescriptionId, jobDescription.id),
              eq(jobDescription.organizationId, studioInterview.organizationId),
            ),
          )
          .where(
            and(
              eq(studioInterview.organizationId, organizationId),
              inArray(studioInterview.id, studioIds),
            ),
          );

  const poolRows =
    poolIds.length === 0
      ? []
      : await db
          .select({
            candidateEmail: resumePoolItem.candidateEmail,
            candidateName: resumePoolItem.candidateName,
            candidatePhone: resumePoolItem.candidatePhone,
            createdAt: resumePoolItem.createdAt,
            id: resumePoolItem.id,
            jobDescriptionName: jobDescription.name,
            resumeProfile: resumePoolItem.resumeProfile,
            status: resumePoolItem.status,
            targetRole: resumePoolItem.targetRole,
            uploaderImage: user.image,
            uploaderName: user.name,
          })
          .from(resumePoolItem)
          .leftJoin(user, eq(resumePoolItem.createdBy, user.id))
          .leftJoin(
            jobDescription,
            and(
              eq(resumePoolItem.jobDescriptionId, jobDescription.id),
              eq(jobDescription.organizationId, resumePoolItem.organizationId),
            ),
          )
          .where(
            and(
              eq(resumePoolItem.organizationId, organizationId),
              inArray(resumePoolItem.id, poolIds),
              options.poolScope ? eq(resumePoolItem.scope, options.poolScope) : undefined,
              options.poolOwnerUserId
                ? eq(resumePoolItem.createdBy, options.poolOwnerUserId)
                : undefined,
            ),
          );

  return [
    ...studioRows.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      sourceType: "studio_interview" as const,
      status: getCandidateActivityStatus(row.pipelineStage),
    })),
    ...poolRows.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      sourceType: "resume_pool_item" as const,
    })),
  ];
}
