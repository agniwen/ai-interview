import { setTimeout as delay } from "node:timers/promises";
import { and, count, eq, inArray } from "drizzle-orm";
import type {
  JobDescriptionRecommendation,
  JobDescriptionRecommendationResult,
} from "@arc/shared/job-descriptions";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { department, jobDescription, resumeSemanticIndex } from "@arc/db-schema/schema";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import {
  embedResumeSemanticTexts,
  getResumeEmbeddingConfig,
  isResumeSemanticIndexEnabled,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { isResumeParseQueueConfigured } from "@arc/resume-parse-queue/resume-parse";
import { getResumeSemanticIndexConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import {
  SEARCH_LIMIT_BY_CHUNK,
  mergeVectorScores,
  weightedScore,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/scoring";
import type { VectorScores } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/scoring";
import { buildResumeSemanticTexts } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/text-builders";
import type {
  ResumeSemanticChunkType,
  ResumeSemanticTextChunk,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/text-builders";
import type {
  ResumeEmbeddingChunk,
  ResumeStoredEmbeddingChunk,
  ResumeVectorStore,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/vector-store";

const JD_REC_EMBED_TIMEOUT_MS = 3000;
const SCORE_THRESHOLD = 55;
const DESCRIPTION_SUMMARY_LENGTH = 200;

export interface JobDescriptionDisplayRow {
  departmentName: string | null;
  description: string | null;
  id: string;
  name: string;
}

export interface RecommendJdInput {
  organizationId: string;
  resume: { id: string; jobDescriptionId: string | null; profile: ResumeProfile | null };
  topN: number;
}

interface ChunkEmbedding {
  chunkType: ResumeSemanticChunkType;
  embedding: number[];
}

export interface ScoreJdCoreInput {
  chunkEmbeddings: ChunkEmbedding[];
  organizationId: string;
}

export interface JdRankedEntry {
  jdId: string;
  row: JobDescriptionDisplayRow;
  score: number;
  similarity: VectorScores;
}

export interface JdRecommendationDeps {
  countIndexedJdVectors: (organizationId: string) => Promise<number>;
  embed: (input: {
    apiKey: string;
    baseUrl: string;
    chunks: ResumeSemanticTextChunk[];
    dimensions: number;
    model: string;
  }) => Promise<ResumeEmbeddingChunk[]>;
  embeddingConfig: ReturnType<typeof getResumeEmbeddingConfig>;
  embeddingVersion: string;
  enabled: boolean;
  enqueueResumeReindex: (input: { organizationId: string; sourceId: string }) => Promise<void>;
  isReindexQueueConfigured: () => boolean;
  loadJobDescriptionsForDisplay: (
    organizationId: string,
    ids: string[],
  ) => Promise<JobDescriptionDisplayRow[]>;
  loadResumeChunks: (input: {
    embeddingVersion: string;
    organizationId: string;
    sourceId: string;
    sourceType: "resume_pool_item";
  }) => Promise<ResumeStoredEmbeddingChunk[]>;
  vectorStore: Pick<ResumeVectorStore, "searchSimilarResumes">;
}

function buildReasons(similarity: VectorScores): string[] {
  const reasons: string[] = [];
  if (similarity.skillRole !== undefined) {
    reasons.push("技能与岗位要求相似");
  }
  if (similarity.workProject !== undefined) {
    reasons.push("职责/项目经验匹配");
  }
  if (similarity.resumeOverview !== undefined) {
    reasons.push("整体画像匹配");
  }
  return reasons;
}

function summarizeDescription(description: string | null): string | null {
  if (!description) {
    return description;
  }
  return description.length > DESCRIPTION_SUMMARY_LENGTH
    ? `${description.slice(0, DESCRIPTION_SUMMARY_LENGTH)}…`
    : description;
}

function toRecommendation(entry: JdRankedEntry): JobDescriptionRecommendation {
  return {
    departmentName: entry.row.departmentName,
    description: summarizeDescription(entry.row.description),
    id: entry.row.id,
    name: entry.row.name,
    reasons: buildReasons(entry.similarity),
    score: entry.score,
    similarity: {
      resumeOverview: entry.similarity.resumeOverview,
      skillRole: entry.similarity.skillRole,
      workProject: entry.similarity.workProject,
    },
  };
}

async function rejectAfterTimeout(ms: number, signal: AbortSignal): Promise<never> {
  try {
    await delay(ms, undefined, { signal });
  } catch {
    // aborted because the guarded promise already settled first; fall through to throw below.
  }
  throw new Error("resume embed timed out");
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  try {
    return await Promise.race([promise, rejectAfterTimeout(ms, controller.signal)]);
  } finally {
    controller.abort();
  }
}

function indexingResult(resumeId: string): JobDescriptionRecommendationResult {
  return {
    diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
    recommendations: [],
    resume: { id: resumeId },
    status: "indexing",
  };
}

function disabledResult(resumeId: string): JobDescriptionRecommendationResult {
  return {
    diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
    recommendations: [],
    resume: { id: resumeId },
    status: "disabled",
  };
}

// 出口态收敛：`indexing` 仅在补索引队列能真正落队时才是可自愈的等待态。
// 队列未配置/不可达时后台补索引是 no-op，若仍回 indexing 用户会永久卡重试（无出口态）。
function pendingResult(
  deps: Pick<JdRecommendationDeps, "isReindexQueueConfigured">,
  resumeId: string,
  reason: string,
): JobDescriptionRecommendationResult {
  if (!deps.isReindexQueueConfigured()) {
    console.warn(
      "[jd-recommendations] 语义补索引队列未配置，返回 disabled 而非 indexing（避免死循环）",
      { reason, resumeId },
    );
    return disabledResult(resumeId);
  }
  return indexingResult(resumeId);
}

export async function scoreJobDescriptionsForResume(
  input: ScoreJdCoreInput,
  // oxlint-disable-next-line no-use-before-define -- default dependency factory stays below the public function.
  deps: JdRecommendationDeps = createDefaultJdRecommendationDeps(),
): Promise<{
  aboveThresholdCount: number;
  loadedIds: Set<string>;
  ranked: JdRankedEntry[];
  retrievedIds: Set<string>;
}> {
  const resultGroups = await Promise.all(
    input.chunkEmbeddings.map((chunk) =>
      deps.vectorStore.searchSimilarResumes({
        chunkType: chunk.chunkType,
        embedding: chunk.embedding,
        limit: SEARCH_LIMIT_BY_CHUNK[chunk.chunkType],
        organizationId: input.organizationId,
        sourceTypes: ["job_description"],
      }),
    ),
  );
  const bySource = mergeVectorScores(resultGroups.flat(), "job_description");
  const retrievedIds = new Set(bySource.keys());
  const aboveThreshold = [...bySource.entries()]
    .map(([jdId, similarity]) => ({ jdId, score: weightedScore(similarity), similarity }))
    .filter((entry) => entry.score >= SCORE_THRESHOLD)
    .toSorted((a, b) => b.score - a.score || a.jdId.localeCompare(b.jdId));

  const rows = await deps.loadJobDescriptionsForDisplay(
    input.organizationId,
    aboveThreshold.map((entry) => entry.jdId),
  );
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const loadedIds = new Set(rows.map((row) => row.id));

  const ranked = aboveThreshold.flatMap((entry): JdRankedEntry[] => {
    const row = rowById.get(entry.jdId);
    return row ? [{ jdId: entry.jdId, row, score: entry.score, similarity: entry.similarity }] : [];
  });

  return { aboveThresholdCount: aboveThreshold.length, loadedIds, ranked, retrievedIds };
}

export async function recommendJobDescriptionsForResume(
  input: RecommendJdInput,
  // oxlint-disable-next-line no-use-before-define -- default dependency factory stays below the public function.
  deps: JdRecommendationDeps = createDefaultJdRecommendationDeps(),
): Promise<JobDescriptionRecommendationResult> {
  if (!deps.enabled) {
    return disabledResult(input.resume.id);
  }
  if (input.resume.jobDescriptionId) {
    return {
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: input.resume.id },
      status: "already_matched",
    };
  }

  const stored = await deps.loadResumeChunks({
    embeddingVersion: deps.embeddingVersion,
    organizationId: input.organizationId,
    sourceId: input.resume.id,
    sourceType: "resume_pool_item",
  });

  let chunkEmbeddings: ChunkEmbedding[];
  if (stored.length === 0) {
    await deps.enqueueResumeReindex({
      organizationId: input.organizationId,
      sourceId: input.resume.id,
    });
    if (!input.resume.profile) {
      return pendingResult(deps, input.resume.id, "resume_unindexed_no_profile");
    }
    try {
      const embedded = await withTimeout(
        deps.embed({
          ...deps.embeddingConfig,
          chunks: buildResumeSemanticTexts(input.resume.profile),
        }),
        JD_REC_EMBED_TIMEOUT_MS,
      );
      chunkEmbeddings = embedded.map((chunk) => ({
        chunkType: chunk.chunkType,
        embedding: chunk.embedding,
      }));
    } catch {
      return pendingResult(deps, input.resume.id, "resume_embed_timeout");
    }
  } else {
    chunkEmbeddings = stored.map((chunk) => ({
      chunkType: chunk.chunkType,
      embedding: chunk.embedding,
    }));
  }

  const core = await scoreJobDescriptionsForResume(
    { chunkEmbeddings, organizationId: input.organizationId },
    deps,
  );

  const existenceDropped = core.aboveThresholdCount - core.ranked.length;
  if (existenceDropped > 0) {
    console.warn("[jd-recommendations] 命中岗位已被删除（存在性 join 掉出），疑似孤儿向量未清理", {
      existenceDropped,
      organizationId: input.organizationId,
      resumeId: input.resume.id,
    });
  }

  if (core.retrievedIds.size === 0) {
    const indexedJdCount = await deps.countIndexedJdVectors(input.organizationId);
    if (indexedJdCount === 0) {
      return pendingResult(deps, input.resume.id, "jd_vectors_absent");
    }
    return {
      diagnostics: { aboveThresholdCount: 0, eligibleCount: 0, vectorHitCount: 0 },
      recommendations: [],
      resume: { id: input.resume.id },
      status: "ready",
    };
  }

  const recommendations = core.ranked.slice(0, input.topN).map(toRecommendation);

  return {
    diagnostics: {
      aboveThresholdCount: core.aboveThresholdCount,
      eligibleCount: core.ranked.length,
      vectorHitCount: core.retrievedIds.size,
    },
    recommendations,
    resume: { id: input.resume.id },
    status: "ready",
  };
}

async function countIndexedJdVectors(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(resumeSemanticIndex)
    .where(
      and(
        eq(resumeSemanticIndex.organizationId, organizationId),
        eq(resumeSemanticIndex.sourceType, "job_description"),
        eq(resumeSemanticIndex.status, "indexed"),
      ),
    );
  return row?.total ?? 0;
}

async function loadJobDescriptionsForDisplay(
  organizationId: string,
  ids: string[],
): Promise<JobDescriptionDisplayRow[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      departmentName: department.name,
      description: jobDescription.description,
      id: jobDescription.id,
      name: jobDescription.name,
    })
    .from(jobDescription)
    .leftJoin(department, eq(jobDescription.departmentId, department.id))
    .where(and(eq(jobDescription.organizationId, organizationId), inArray(jobDescription.id, ids)));
  return rows.map((row) => ({ ...row, departmentName: row.departmentName ?? null }));
}

export function createDefaultJdRecommendationDeps(): JdRecommendationDeps {
  const embeddingConfig = getResumeEmbeddingConfig();
  const semanticConfig = getResumeSemanticIndexConfig();
  const vectorStore = new QdrantResumeVectorStore({
    apiKey: semanticConfig.qdrantApiKey,
    collectionName: semanticConfig.qdrantCollectionName,
    dimensions: semanticConfig.dimensions,
    url: semanticConfig.qdrantUrl || "http://127.0.0.1:6333",
  });
  return {
    countIndexedJdVectors,
    embed: embedResumeSemanticTexts,
    embeddingConfig,
    embeddingVersion: semanticConfig.embeddingVersion,
    enabled:
      isResumeSemanticIndexEnabled() &&
      Boolean(semanticConfig.qdrantUrl) &&
      Boolean(embeddingConfig.apiKey),
    enqueueResumeReindex: (input) =>
      enqueueResumeSemanticIndexJobBestEffort({
        organizationId: input.organizationId,
        sourceId: input.sourceId,
        sourceType: "resume_pool_item",
      }),
    isReindexQueueConfigured: isResumeParseQueueConfigured,
    loadJobDescriptionsForDisplay,
    loadResumeChunks: (loadInput) => vectorStore.loadResumeEmbeddings(loadInput),
    vectorStore,
  };
}
