import { and, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
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
  status: DedupMatchRecord["status"];
  targetRole: string | null;
}

interface FindSemanticResumeDuplicatesInput {
  email?: string | null;
  name?: string | null;
  organizationId: string;
  phone?: string | null;
  resumeProfile?: ResumeProfile | null;
}

interface SemanticDedupDeps {
  embed: typeof embedResumeSemanticTexts;
  embeddingConfig: ReturnType<typeof getResumeEmbeddingConfig>;
  enabled: boolean;
  loadCandidates: (organizationId: string, ids: string[]) => Promise<SemanticCandidateRecord[]>;
  vectorStore: ResumeVectorStore;
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
): Map<string, VectorSimilarityScores> {
  const map = new Map<string, VectorSimilarityScores>();
  for (const result of results) {
    if (result.sourceType !== "studio_interview") {
      continue;
    }
    const current = map.get(result.sourceId) ?? {};
    if (result.chunkType === "resume_overview") {
      current.resumeOverview = Math.max(current.resumeOverview ?? 0, result.score);
    } else if (result.chunkType === "work_project") {
      current.workProject = Math.max(current.workProject ?? 0, result.score);
    } else if (result.chunkType === "skill_role") {
      current.skillRole = Math.max(current.skillRole ?? 0, result.score);
    }
    map.set(result.sourceId, current);
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
        }),
      ),
    );
    const searchResults = searchResultGroups.flat();
    const bySource = mergeVectorScores(searchResults);
    const candidates = await deps.loadCandidates(input.organizationId, [...bySource.keys()]);
    const semanticMatches = candidates.flatMap((candidate): DedupMatchRecord[] => {
      const vectorScores = bySource.get(candidate.id);
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
          score: rerank.score,
          semanticReasons: rerank.reasons,
          similarity: toSimilarity(vectorScores),
          status: candidate.status,
          targetRole: candidate.targetRole,
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
  ids: string[],
): Promise<SemanticCandidateRecord[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      id: studioInterview.id,
      jobDescriptionName: jobDescription.name,
      resumeProfile: studioInterview.resumeProfile,
      status: studioInterview.status,
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
    .where(
      and(eq(studioInterview.organizationId, organizationId), inArray(studioInterview.id, ids)),
    );

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  }));
}
