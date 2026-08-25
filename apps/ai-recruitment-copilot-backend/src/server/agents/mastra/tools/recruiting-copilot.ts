/* oxlint-disable max-lines -- recruiting copilot search/detail/proposal tools stay co-located. */
import { createTool } from "@mastra/core/tools";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { QdrantResumeVectorStore } from "@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store";
import {
  embedResumeSemanticTexts,
  getResumeEmbeddingConfig,
  isResumeSemanticIndexEnabled,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { getResumeSemanticIndexConfig } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
import type { ResumeSemanticTextChunk } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/text-builders";
import type {
  ResumeVectorSearchResult,
  ResumeVectorStore,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/vector-store";
import { listResumeRecords } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import {
  listRecruitingJobDescriptions,
  loadRecruitingJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { loadResumePoolItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { upsertConversationContextJobBinding } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat";
import type { ChatContextBindings } from "@arc/db-schema/chat-context-bindings";
import { EMPTY_CHAT_CONTEXT_BINDINGS } from "@arc/db-schema/chat-context-bindings";
import { jobEvaluationModeSchema } from "@arc/db-schema/job-description-evaluation";
import { resumeReviewLooseSchema } from "@arc/db-schema/resume-review";
import { jobDescription, resumePoolItem, studioInterview } from "@arc/db-schema/schema";
import { resumeReviewStatusSchema } from "@arc/db-schema/studio-interviews";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import type { StructuredResumeEvaluationV1 } from "@arc/db-schema/structured-resume-evaluation";
import { structuredResumeReviewSchema } from "@arc/shared/recruiting-copilot";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import type { ResumePoolDetail } from "@arc/shared/resume-pool";
import { normalizeResumePoolItemId } from "./resume-pool-id";

export { normalizeResumePoolItemId } from "./resume-pool-id";

const MAX_SEARCH_LIMIT = 10;
const MAX_COMPARISON_CANDIDATES = 5;

async function resolveConversationJobOverlay(input: {
  boundJobDescriptionId: string | undefined;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  organizationId: string;
}): Promise<{ jobDescriptionId: string | null; jobDescriptionName: string | null }> {
  if (!input.boundJobDescriptionId) {
    return {
      jobDescriptionId: input.jobDescriptionId,
      jobDescriptionName: input.jobDescriptionName,
    };
  }
  if (input.boundJobDescriptionId === input.jobDescriptionId && input.jobDescriptionName) {
    return {
      jobDescriptionId: input.jobDescriptionId,
      jobDescriptionName: input.jobDescriptionName,
    };
  }
  const bound = await loadRecruitingJobDescriptionById(
    input.organizationId,
    input.boundJobDescriptionId,
  );
  if (!bound) {
    return {
      jobDescriptionId: input.jobDescriptionId,
      jobDescriptionName: input.jobDescriptionName,
    };
  }
  return {
    jobDescriptionId: bound.id,
    jobDescriptionName: bound.name,
  };
}

export const copilotCitationSchema = z.object({
  id: z.string(),
  label: z.string(),
  recordType: z.enum(["job_description", "resume_pool_item", "resume_record"]),
  secondaryLabel: z.string().nullable(),
});

export const candidateSummaryCardSchema = z.object({
  candidateName: z.string(),
  hasResumeFile: z.boolean(),
  id: z.string(),
  jobDescriptionId: z.string().nullable(),
  jobDescriptionName: z.string().nullable(),
  keySkills: z.array(z.string()),
  notes: z.string().nullable(),
  pipelineStage: z.string(),
  resumeFileName: z.string().nullable(),
  resumeSummary: z.string().nullable(),
  targetRole: z.string().nullable(),
  updatedAt: z.string(),
  workYears: z.number().nullable(),
});

export const resumeRecordDetailSchema = z.object({
  candidateName: z.string(),
  citation: copilotCitationSchema,
  id: z.string(),
  interviewQuestions: z.array(z.unknown()),
  jobDescriptionId: z.string().nullable(),
  jobDescriptionName: z.string().nullable(),
  notes: z.string().nullable(),
  pipelineStage: z.string(),
  resumeEvaluationArtifactMode: jobEvaluationModeSchema.nullable(),
  resumeProfile: z.unknown().nullable(),
  resumeReview: resumeReviewLooseSchema.nullable(),
  resumeReviewError: z.string().nullable(),
  resumeReviewStatus: resumeReviewStatusSchema,
  resumeSummary: z.string().nullable(),
  resumeText: z.string().nullable(),
  structuredResumeReview: structuredResumeReviewSchema.nullable(),
  targetRole: z.string().nullable(),
});

export const jobDescriptionSummarySchema = z.object({
  code: z.string().nullable(),
  departmentName: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
});

export const recruitingActionProposalSchema = z.object({
  explanation: z.string(),
  id: z.string(),
  payload: z.record(z.string(), z.json()),
  title: z.string(),
  type: z.enum([
    "bind_candidate_to_job",
    "bind_pool_item_to_job",
    "advance_candidate_stage",
    "generate_interview_questions",
  ]),
});

export const recruitingActionConfirmationSchema = z.object({
  confirmedAt: z.string(),
  jobDescriptionId: z.string().optional(),
  jobDescriptionName: z.string().nullable().optional(),
  status: z.enum(["confirmed", "ignored"]),
});

export const searchResumeRecordsInputSchema = z.object({
  jobDescriptionIds: z.array(z.string().min(1)).min(1).max(MAX_COMPARISON_CANDIDATES).optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
  pipelineStages: z.array(z.string().min(1)).max(10).optional(),
  query: z.string().trim().max(120).optional(),
  skills: z.array(z.string().min(1)).max(20).optional(),
});

export const searchResumeRecordsOutputSchema = z.object({
  candidateSummaryCards: z.array(candidateSummaryCardSchema),
  citations: z.array(copilotCitationSchema),
  retrievalMode: z.enum(["combined", "semantic", "structured", "structured_text"]),
  semanticHitCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

const resumeRecordDetailRequestSchema = z.object({
  id: z.string().min(1),
  includeResumeText: z.boolean().optional(),
});

export const getResumeRecordDetailInputSchema = z.object({
  requests: z.array(resumeRecordDetailRequestSchema).min(1).max(MAX_COMPARISON_CANDIDATES),
});

export const getResumeRecordDetailOutputSchema = z.object({
  missingIds: z.array(z.string()),
  resumeRecords: z.array(resumeRecordDetailSchema),
});

export const resumePoolItemDetailSchema = z.object({
  candidateName: z.string(),
  citation: copilotCitationSchema,
  hasAiProfile: z.boolean(),
  id: z.string(),
  jobDescriptionId: z.string().nullable(),
  jobDescriptionName: z.string().nullable(),
  keySkills: z.array(z.string()),
  notes: z.string().nullable(),
  resumeParseStatus: z.string(),
  resumeProfile: z.unknown().nullable(),
  resumeSummary: z.string().nullable(),
  resumeText: z.string().nullable(),
  scope: z.enum(["private", "public"]),
  targetRole: z.string().nullable(),
});

const resumePoolDetailRequestSchema = z.object({
  id: z.string().min(1),
  includeResumeText: z.boolean().optional(),
});

export const getResumePoolDetailInputSchema = z.object({
  requests: z.array(resumePoolDetailRequestSchema).min(1).max(MAX_COMPARISON_CANDIDATES),
});

export const getResumePoolDetailOutputSchema = z.object({
  missingIds: z.array(z.string()),
  resumePoolItems: z.array(resumePoolItemDetailSchema),
});

export const searchJobDescriptionsInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
  query: z.string().trim().max(120).optional(),
});

export const searchJobDescriptionsOutputSchema = z.object({
  citations: z.array(copilotCitationSchema),
  jobDescriptions: z.array(jobDescriptionSummarySchema),
});

export const getJobDescriptionDetailInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_COMPARISON_CANDIDATES),
});

export const getJobDescriptionDetailOutputSchema = z.object({
  citations: z.array(copilotCitationSchema),
  jobDescriptions: z.array(jobDescriptionSummarySchema),
  missingIds: z.array(z.string()),
});

export const proposeRecruitingActionInputSchema = z.object({
  explanation: z.string().trim().min(1).max(600),
  payload: z.record(z.string(), z.json()),
  title: z.string().trim().min(1).max(120),
  type: recruitingActionProposalSchema.shape.type,
});

const nonBindingRecruitingActionInputSchema = proposeRecruitingActionInputSchema.extend({
  type: z.enum(["advance_candidate_stage", "generate_interview_questions"]),
});

export function getRecruitingActionInputSchema(bindingConsent: boolean) {
  return bindingConsent
    ? proposeRecruitingActionInputSchema
    : nonBindingRecruitingActionInputSchema;
}

export const proposeRecruitingActionOutputSchema = z.object({
  confirmation: recruitingActionConfirmationSchema.optional(),
  proposal: recruitingActionProposalSchema,
});

export interface SearchResumeRecordsDeps {
  listResumeRecords: typeof listResumeRecords;
  semanticSearch?: typeof searchSemanticResumeRecords;
}

export function capCandidateComparisonIds(ids: string[]) {
  return {
    ids: ids.slice(0, MAX_COMPARISON_CANDIDATES),
    truncated: ids.length > MAX_COMPARISON_CANDIDATES,
  };
}

function cleanString(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function readResumeReviewConclusion(
  value: z.infer<typeof resumeReviewLooseSchema> | null,
): string | null {
  return cleanString(value?.overall.conclusion);
}

function toStructuredResumeReview(
  evaluation: StructuredResumeEvaluationV1,
): z.infer<typeof structuredResumeReviewSchema> {
  const dimensionRationale = (key: keyof typeof evaluation.dimensions): string => {
    const ruleRationale = evaluation.dimensions[key].ruleJudgments
      .map((judgment) => judgment.reason)
      .join("；");
    return (
      evaluation.narrative.dimensionComments?.[key] || ruleRationale || evaluation.narrative.summary
    );
  };
  const dimension = (key: keyof typeof evaluation.dimensions) => ({
    rationale: dimensionRationale(key),
    score: evaluation.dimensions[key].rawScore,
    weight: evaluation.dimensions[key].weight,
  });

  return structuredResumeReviewSchema.parse({
    adjustments: evaluation.adjustments.matches
      .filter((match) => match.matched)
      .map((match) => ({
        appliedPoints: match.appliedPoints,
        kind: match.kind,
        reason: match.reason,
        sourceText: match.sourceText,
      })),
    compositeScore: evaluation.calculations.compositeScore,
    dimensions: {
      educationBackground: dimension("educationBackground"),
      experienceRelevance: dimension("experienceRelevance"),
      potential: dimension("potential"),
      projectMatch: dimension("projectMatch"),
      skillMatch: dimension("skillMatch"),
      stability: dimension("stability"),
    },
    gateJudgments: evaluation.gates.judgments.map((judgment) => ({
      category: judgment.category,
      reason: judgment.reason,
      status: judgment.correction?.correctedStatus ?? judgment.aiStatus,
    })),
    gateStatus: evaluation.gates.effectiveStatus,
    grade: evaluation.grade,
    overallComment: evaluation.narrative.overallComment ?? null,
    recommendation: evaluation.narrative.recommendation,
    summary: evaluation.narrative.summary,
  });
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toCandidateSummaryCard(record: ResumeLibraryListRecord) {
  return {
    candidateName: record.candidateName,
    hasResumeFile: record.hasResumeFile,
    id: record.id,
    jobDescriptionId: record.jobDescriptionId,
    jobDescriptionName: record.jobDescriptionName,
    keySkills: record.resumeSkills.slice(0, 8),
    notes: cleanString(record.notes),
    pipelineStage: record.pipelineStage,
    resumeFileName: record.resumeFileName,
    resumeSummary: cleanString(record.resumeSummary),
    targetRole: cleanString(record.targetRole),
    updatedAt: serializeDate(record.updatedAt),
    workYears: null,
  };
}

function mergeCandidateSummaryCards(
  primary: z.infer<typeof candidateSummaryCardSchema>[],
  secondary: z.infer<typeof candidateSummaryCardSchema>[],
) {
  const seen = new Set<string>();
  const merged: z.infer<typeof candidateSummaryCardSchema>[] = [];
  for (const card of [...primary, ...secondary]) {
    if (seen.has(card.id)) {
      continue;
    }
    seen.add(card.id);
    merged.push(card);
  }
  return merged;
}

function resolveRetrievalMode({
  hasQuery,
  semanticCount,
  structuredCount,
}: {
  hasQuery: boolean;
  semanticCount: number;
  structuredCount: number;
}): z.infer<typeof searchResumeRecordsOutputSchema>["retrievalMode"] {
  if (semanticCount > 0) {
    return structuredCount > 0 ? "combined" : "semantic";
  }
  return hasQuery ? "structured_text" : "structured";
}

function toResumeCitation(record: ResumeLibraryListRecord) {
  return {
    id: record.id,
    label: record.candidateName,
    recordType: "resume_record" as const,
    secondaryLabel: record.jobDescriptionName,
  };
}

export async function searchResumeRecordsForCopilot(
  input: z.infer<typeof searchResumeRecordsInputSchema> & {
    organizationId: string;
    visibilityScope: RecruitingVisibilityScope;
  },
  deps?: SearchResumeRecordsDeps,
): Promise<z.infer<typeof searchResumeRecordsOutputSchema>> {
  const parsed = searchResumeRecordsInputSchema.parse(input);
  const resumeRecordsDeps = deps ?? { listResumeRecords };
  const limit = parsed.limit ?? 5;
  const result = await resumeRecordsDeps.listResumeRecords(
    input.organizationId,
    {
      jobDescriptionIds: parsed.jobDescriptionIds ?? null,
      pipelineStages: parsed.pipelineStages ?? null,
      search: parsed.query ?? null,
      skills: parsed.skills ?? null,
    },
    {
      page: 1,
      pageSize: limit,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    input.visibilityScope,
  );
  const semanticCards = parsed.query
    ? // oxlint-disable-next-line no-use-before-define -- Default dependency is declared below the public tool entrypoint.
      await (resumeRecordsDeps.semanticSearch ?? searchSemanticResumeRecords)({
        jobDescriptionIds: parsed.jobDescriptionIds,
        limit,
        organizationId: input.organizationId,
        pipelineStages: parsed.pipelineStages,
        query: parsed.query,
        skills: parsed.skills,
        visibilityScope: input.visibilityScope,
      })
    : [];
  const candidateSummaryCards = mergeCandidateSummaryCards(
    result.records.map(toCandidateSummaryCard),
    semanticCards,
  ).slice(0, limit);
  // oxlint-disable-next-line no-use-before-define -- Helper is kept below the main flow for readability.
  const citations = mergeCitations([
    ...result.records.map(toResumeCitation),
    ...semanticCards.map((card) => ({
      id: card.id,
      label: card.candidateName,
      recordType: "resume_record" as const,
      secondaryLabel: card.jobDescriptionName,
    })),
  ]);
  return {
    candidateSummaryCards,
    citations,
    retrievalMode: resolveRetrievalMode({
      hasQuery: Boolean(parsed.query),
      semanticCount: semanticCards.length,
      structuredCount: result.records.length,
    }),
    semanticHitCount: semanticCards.length,
    total: result.total,
  };
}

function mergeCitations(citations: z.infer<typeof copilotCitationSchema>[]) {
  const seen = new Set<string>();
  const merged: z.infer<typeof copilotCitationSchema>[] = [];
  for (const citation of citations) {
    const key = `${citation.recordType}:${citation.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(citation);
  }
  return merged;
}

function buildQueryChunks(query: string): ResumeSemanticTextChunk[] {
  return [
    { chunkType: "resume_overview", text: query },
    { chunkType: "skill_role", text: query },
    { chunkType: "work_project", text: query },
  ];
}

function createSemanticSearchDeps() {
  const embeddingConfig = getResumeEmbeddingConfig();
  const semanticConfig = getResumeSemanticIndexConfig();
  return {
    embed: embedResumeSemanticTexts,
    embeddingConfig,
    enabled:
      isResumeSemanticIndexEnabled() &&
      Boolean(semanticConfig.qdrantUrl) &&
      Boolean(embeddingConfig.apiKey),
    vectorStore: new QdrantResumeVectorStore({
      apiKey: semanticConfig.qdrantApiKey,
      collectionName: semanticConfig.qdrantCollectionName,
      dimensions: semanticConfig.dimensions,
      url: semanticConfig.qdrantUrl || "http://127.0.0.1:6333",
    }) satisfies ResumeVectorStore,
  };
}

function mergeSemanticSourceIds(results: ResumeVectorSearchResult[]) {
  const scores = new Map<string, number>();
  for (const result of results) {
    if (result.sourceType !== "studio_interview") {
      continue;
    }
    scores.set(result.sourceId, Math.max(scores.get(result.sourceId) ?? 0, result.score));
  }
  return [...scores.entries()].toSorted((a, b) => b[1] - a[1]).map(([id]) => id);
}

function matchesSemanticFilters(
  record: z.infer<typeof candidateSummaryCardSchema>,
  filters: {
    jobDescriptionIds?: string[];
    pipelineStages?: string[];
    skills?: string[];
  },
) {
  if (
    filters.jobDescriptionIds?.length &&
    (!record.jobDescriptionId || !filters.jobDescriptionIds.includes(record.jobDescriptionId))
  ) {
    return false;
  }
  if (filters.pipelineStages?.length && !filters.pipelineStages.includes(record.pipelineStage)) {
    return false;
  }
  if (filters.skills?.length) {
    const normalized = new Set(record.keySkills.map((skill) => skill.trim().toLowerCase()));
    return filters.skills.every((skill) => normalized.has(skill.trim().toLowerCase()));
  }
  return true;
}

async function loadSemanticCandidateCards({
  ids,
  organizationId,
  visibilityScope,
}: {
  ids: string[];
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}) {
  if (ids.length === 0 || visibilityScope.kind === "none") {
    return [];
  }
  const visibilityCondition =
    visibilityScope.kind === "restricted"
      ? inArray(studioInterview.createdBy, visibilityScope.userIds)
      : undefined;
  const rows = await db
    .select({
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: studioInterview.notes,
      pipelineStage: studioInterview.pipelineStage,
      resumeFileName: studioInterview.resumeFileName,
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
      resumeStorageKey: studioInterview.resumeStorageKey,
      skills: studioInterview.skillsNormalized,
      targetRole: studioInterview.targetRole,
      updatedAt: studioInterview.updatedAt,
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
      and(
        eq(studioInterview.organizationId, organizationId),
        inArray(studioInterview.id, ids),
        ne(studioInterview.pipelineStage, "closed"),
        visibilityCondition,
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) {
      return [];
    }
    return [
      {
        candidateName: row.candidateName,
        hasResumeFile: Boolean(row.resumeStorageKey),
        id: row.id,
        jobDescriptionId: row.jobDescriptionId,
        jobDescriptionName: row.jobDescriptionName,
        keySkills: row.skills.slice(0, 8),
        notes: cleanString(row.notes),
        pipelineStage: row.pipelineStage,
        resumeFileName: row.resumeFileName,
        resumeSummary: readResumeReviewConclusion(row.resumeReview) ?? cleanString(row.notes),
        targetRole: cleanString(row.targetRole),
        updatedAt: serializeDate(row.updatedAt),
        workYears: row.resumeProfile?.workYears ?? null,
      },
    ];
  });
}

export async function searchSemanticResumeRecords(input: {
  jobDescriptionIds?: string[];
  limit: number;
  organizationId: string;
  pipelineStages?: string[];
  query: string;
  skills?: string[];
  visibilityScope: RecruitingVisibilityScope;
}): Promise<z.infer<typeof candidateSummaryCardSchema>[]> {
  const deps = createSemanticSearchDeps();
  if (!deps.enabled) {
    return [];
  }
  try {
    const embedded = await deps.embed({
      ...deps.embeddingConfig,
      chunks: buildQueryChunks(input.query),
    });
    await deps.vectorStore.ensureCollection();
    const resultGroups = await Promise.all(
      embedded.map((chunk) =>
        deps.vectorStore.searchSimilarResumes({
          chunkType: chunk.chunkType,
          embedding: chunk.embedding,
          limit: Math.max(input.limit * 4, 20),
          organizationId: input.organizationId,
          sourceTypes: ["studio_interview"],
        }),
      ),
    );
    const ids = mergeSemanticSourceIds(resultGroups.flat()).slice(0, Math.max(input.limit * 3, 10));
    const cards = await loadSemanticCandidateCards({
      ids,
      organizationId: input.organizationId,
      visibilityScope: input.visibilityScope,
    });
    return cards
      .filter((record) =>
        matchesSemanticFilters(record, {
          jobDescriptionIds: input.jobDescriptionIds,
          pipelineStages: input.pipelineStages,
          skills: input.skills,
        }),
      )
      .slice(0, input.limit);
  } catch (error) {
    console.warn("[recruiting-copilot] semantic resume search failed", error);
    return [];
  }
}

export function buildConversationBindProposalId(
  kind: "resume_pool_item" | "resume_record",
  recordId: string,
) {
  return `conversation-bind:${kind}:${recordId}`;
}

function resolveRecruitingActionProposalId(
  input: z.infer<typeof proposeRecruitingActionInputSchema>,
): string {
  if (input.type === "bind_candidate_to_job") {
    const parsedResumeRecordId = z.string().safeParse(input.payload.resumeRecordId);
    const resumeRecordId = parsedResumeRecordId.success ? parsedResumeRecordId.data : null;
    if (resumeRecordId) {
      return buildConversationBindProposalId("resume_record", resumeRecordId);
    }
  }
  if (input.type === "bind_pool_item_to_job") {
    const parsedPoolItemId = z.string().safeParse(input.payload.poolItemId);
    const rawPoolItemId = parsedPoolItemId.success ? parsedPoolItemId.data : null;
    const poolItemId = rawPoolItemId ? normalizeResumePoolItemId(rawPoolItemId) : null;
    if (poolItemId) {
      return buildConversationBindProposalId("resume_pool_item", poolItemId);
    }
  }
  return crypto.randomUUID();
}

export function createRecruitingActionProposal(
  input: z.infer<typeof proposeRecruitingActionInputSchema> & { id?: string },
): z.infer<typeof proposeRecruitingActionOutputSchema> {
  const parsed = proposeRecruitingActionInputSchema.parse(input);
  return {
    proposal: {
      ...parsed,
      id: input.id ?? resolveRecruitingActionProposalId(parsed),
    },
  };
}

function confirmedConversationBindResult(input: {
  extraPayload?: Record<string, z.infer<ReturnType<typeof z.json>>>;
  jobDescriptionId: string;
  jobDescriptionName: string;
  proposal: z.infer<typeof recruitingActionProposalSchema>;
}): z.infer<typeof proposeRecruitingActionOutputSchema> {
  const { jobDescriptionId, jobDescriptionName, proposal } = input;
  return {
    confirmation: {
      confirmedAt: new Date().toISOString(),
      jobDescriptionId,
      jobDescriptionName,
      status: "confirmed",
    },
    proposal: {
      ...proposal,
      explanation: `用户已确认：本对话分析岗位为「${jobDescriptionName}」（jobDescriptionId=${jobDescriptionId}）。请立即基于该岗位继续匹配/分析；不要再说未绑定岗位，也不要再次调用 propose_recruiting_action。`,
      payload: {
        ...proposal.payload,
        ...input.extraPayload,
        jobDescriptionId,
      },
      title: `已关联「${jobDescriptionName}」`,
    },
  };
}

async function resolvePriorRecruitingActionConfirmation(input: {
  organizationId: string;
  priorConfirmation: z.infer<typeof recruitingActionConfirmationSchema> | undefined;
  proposal: z.infer<typeof recruitingActionProposalSchema>;
}): Promise<z.infer<typeof proposeRecruitingActionOutputSchema> | null> {
  const { priorConfirmation, proposal } = input;
  if (priorConfirmation?.status === "confirmed" && priorConfirmation.jobDescriptionId) {
    const selectedJobDescription = await loadRecruitingJobDescriptionById(
      input.organizationId,
      priorConfirmation.jobDescriptionId,
    );
    const name =
      priorConfirmation.jobDescriptionName?.trim() || selectedJobDescription?.name || "已选岗位";
    return confirmedConversationBindResult({
      jobDescriptionId: priorConfirmation.jobDescriptionId,
      jobDescriptionName: name,
      proposal,
    });
  }
  if (priorConfirmation?.status === "ignored") {
    return {
      confirmation: priorConfirmation,
      proposal: {
        ...proposal,
        explanation:
          "用户已忽略本对话岗位关联建议。请在不绑定岗位的前提下继续回答（可说明信息有限）。",
        title: "已忽略岗位关联",
      },
    };
  }
  return null;
}

async function executeCandidateBindProposal(input: {
  contextBindings: ChatContextBindings;
  conversationId: string;
  created: z.infer<typeof proposeRecruitingActionOutputSchema>;
  organizationId: string;
  payloadJobDescriptionId: string | null;
}): Promise<z.infer<typeof proposeRecruitingActionOutputSchema>> {
  const { created } = input;
  const { proposal } = created;
  const parsedResumeRecordId = z.string().safeParse(proposal.payload.resumeRecordId);
  const resumeRecordId = parsedResumeRecordId.success ? parsedResumeRecordId.data : null;
  if (!resumeRecordId) {
    return created;
  }
  const boundFromConversation = input.contextBindings.resume_record?.[resumeRecordId];
  const jobDescriptionId = boundFromConversation ?? input.payloadJobDescriptionId;
  if (!jobDescriptionId) {
    return created;
  }
  const nextJobDescription = await loadRecruitingJobDescriptionById(
    input.organizationId,
    jobDescriptionId,
  );
  if (!nextJobDescription) {
    return created;
  }
  if (boundFromConversation !== jobDescriptionId) {
    const [existing] = await db
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existing) {
      return created;
    }
    await upsertConversationContextJobBinding({
      conversationId: input.conversationId,
      jobDescriptionId,
      jobDescriptionName: nextJobDescription.name,
      kind: "resume_record",
      organizationId: input.organizationId,
      recordId: resumeRecordId,
      summaryText: `已在本对话中将该候选人关联到「${nextJobDescription.name}」（仅影响本轮分析，未改招聘台数据）。`,
    });
  }
  return confirmedConversationBindResult({
    jobDescriptionId,
    jobDescriptionName: nextJobDescription.name,
    proposal,
  });
}

async function executeProposeRecruitingAction(input: {
  conversationId?: string | null;
  contextBindings: ChatContextBindings;
  organizationId: string;
  proposalInput: z.infer<typeof proposeRecruitingActionInputSchema>;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<z.infer<typeof proposeRecruitingActionOutputSchema>> {
  const created = createRecruitingActionProposal(input.proposalInput);
  const { proposal } = created;
  const priorConfirmation = input.contextBindings.actionConfirmations?.[proposal.id];
  const confirmedProposal = await resolvePriorRecruitingActionConfirmation({
    organizationId: input.organizationId,
    priorConfirmation,
    proposal,
  });
  if (confirmedProposal) {
    return confirmedProposal;
  }

  if (proposal.type !== "bind_candidate_to_job" && proposal.type !== "bind_pool_item_to_job") {
    return created;
  }

  if (!input.conversationId) {
    return created;
  }

  const parsedJobDescriptionId = z.string().min(1).safeParse(proposal.payload.jobDescriptionId);
  const payloadJobDescriptionId = parsedJobDescriptionId.success
    ? parsedJobDescriptionId.data
    : null;

  if (proposal.type === "bind_candidate_to_job") {
    return executeCandidateBindProposal({
      contextBindings: input.contextBindings,
      conversationId: input.conversationId,
      created,
      organizationId: input.organizationId,
      payloadJobDescriptionId,
    });
  }

  const parsedPoolItemId = z.string().safeParse(proposal.payload.poolItemId);
  const rawPoolItemId = parsedPoolItemId.success ? parsedPoolItemId.data : null;
  const poolItemId = rawPoolItemId ? normalizeResumePoolItemId(rawPoolItemId) : null;
  if (!poolItemId) {
    return created;
  }
  const boundFromConversation = input.contextBindings.resume_pool_item?.[poolItemId];
  const jobDescriptionId = boundFromConversation ?? payloadJobDescriptionId;
  if (!jobDescriptionId) {
    return created;
  }
  const nextJobDescription = await loadRecruitingJobDescriptionById(
    input.organizationId,
    jobDescriptionId,
  );
  if (!nextJobDescription) {
    return created;
  }
  if (boundFromConversation !== jobDescriptionId) {
    const existing = await loadResumePoolItem({
      organizationId: input.organizationId,
      poolItemId,
      visibilityScope: input.visibilityScope,
    });
    if (!existing) {
      return created;
    }
    await upsertConversationContextJobBinding({
      conversationId: input.conversationId,
      jobDescriptionId,
      jobDescriptionName: nextJobDescription.name,
      kind: "resume_pool_item",
      organizationId: input.organizationId,
      recordId: poolItemId,
      summaryText: `已在本对话中将该人才库条目关联到「${nextJobDescription.name}」（仅影响本轮分析，未改人才库数据）。`,
    });
  }

  return confirmedConversationBindResult({
    extraPayload: { poolItemId },
    jobDescriptionId,
    jobDescriptionName: nextJobDescription.name,
    proposal,
  });
}

export async function getResumeRecordDetailForCopilot(input: {
  contextBindings?: ChatContextBindings;
  organizationId: string;
  requests: z.infer<typeof resumeRecordDetailRequestSchema>[];
  visibilityScope: RecruitingVisibilityScope;
}): Promise<z.infer<typeof getResumeRecordDetailOutputSchema>> {
  const parsed = getResumeRecordDetailInputSchema.parse(input);
  if (input.visibilityScope.kind === "none") {
    return { missingIds: parsed.requests.map((request) => request.id), resumeRecords: [] };
  }
  const ids = parsed.requests.map((request) => request.id);
  const visibilityCondition =
    input.visibilityScope.kind === "restricted"
      ? inArray(studioInterview.createdBy, input.visibilityScope.userIds)
      : undefined;
  const records = await db
    .select({
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      interviewQuestions: studioInterview.interviewQuestions,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: studioInterview.notes,
      pipelineStage: studioInterview.pipelineStage,
      resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
      resumeReviewError: studioInterview.resumeReviewError,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
      resumeText: studioInterview.resumeText,
      structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
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
      and(
        inArray(studioInterview.id, ids),
        eq(studioInterview.organizationId, input.organizationId),
        visibilityCondition,
      ),
    );
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const resumeRecords = await Promise.all(
    parsed.requests.flatMap((request) => {
      const record = recordsById.get(request.id);
      if (!record) {
        return [];
      }
      return [
        (async () => {
          const boundJobDescriptionId = input.contextBindings?.resume_record?.[record.id];
          const jobBinding = await resolveConversationJobOverlay({
            boundJobDescriptionId,
            jobDescriptionId: record.jobDescriptionId,
            jobDescriptionName: record.jobDescriptionName,
            organizationId: input.organizationId,
          });
          const conversationOverridesPersistedJob = Boolean(
            boundJobDescriptionId && boundJobDescriptionId !== record.jobDescriptionId,
          );
          const effectiveResumeReview =
            conversationOverridesPersistedJob ||
            record.resumeEvaluationArtifactMode === "structured"
              ? null
              : record.resumeReview;
          const storedStructuredEvaluation =
            !conversationOverridesPersistedJob &&
            record.resumeEvaluationArtifactMode === "structured"
              ? structuredResumeEvaluationV1Schema.safeParse(record.structuredResumeEvaluation)
              : null;
          const effectiveStructuredResumeReview = storedStructuredEvaluation?.success
            ? toStructuredResumeReview(storedStructuredEvaluation.data)
            : null;
          return {
            candidateName: record.candidateName,
            citation: {
              id: record.id,
              label: record.candidateName,
              recordType: "resume_record" as const,
              secondaryLabel: jobBinding.jobDescriptionName,
            },
            id: record.id,
            interviewQuestions: record.interviewQuestions ?? [],
            jobDescriptionId: jobBinding.jobDescriptionId,
            jobDescriptionName: jobBinding.jobDescriptionName,
            notes: cleanString(record.notes),
            pipelineStage: record.pipelineStage,
            resumeEvaluationArtifactMode: conversationOverridesPersistedJob
              ? null
              : record.resumeEvaluationArtifactMode,
            resumeProfile: record.resumeProfile,
            resumeReview: effectiveResumeReview,
            resumeReviewError: conversationOverridesPersistedJob
              ? null
              : cleanString(record.resumeReviewError),
            resumeReviewStatus: conversationOverridesPersistedJob
              ? "idle"
              : record.resumeReviewStatus,
            resumeSummary:
              effectiveStructuredResumeReview?.summary ??
              readResumeReviewConclusion(effectiveResumeReview) ??
              cleanString(record.notes),
            resumeText: request.includeResumeText
              ? (record.resumeText?.slice(0, 12_000) ?? null)
              : null,
            structuredResumeReview: effectiveStructuredResumeReview,
            targetRole: cleanString(record.targetRole),
          };
        })(),
      ];
    }),
  );
  return {
    missingIds: ids.filter((id) => !recordsById.has(id)),
    resumeRecords,
  };
}

function toResumePoolItemDetail(
  detail: ResumePoolDetail,
  resumeText: string | null,
  jobBinding: { jobDescriptionId: string | null; jobDescriptionName: string | null },
): z.infer<typeof resumePoolItemDetailSchema> {
  const keySkills = (
    detail.masteredSkills.length > 0 ? detail.masteredSkills : detail.skillsNormalized
  ).slice(0, 8);
  return {
    candidateName: detail.candidateName,
    citation: {
      id: `pool:${detail.id}`,
      label: detail.candidateName,
      recordType: "resume_pool_item",
      secondaryLabel: jobBinding.jobDescriptionName,
    },
    hasAiProfile: detail.resumeProfile !== null && detail.resumeProfile !== undefined,
    id: detail.id,
    jobDescriptionId: jobBinding.jobDescriptionId,
    jobDescriptionName: jobBinding.jobDescriptionName,
    keySkills,
    notes: cleanString(detail.notes),
    resumeParseStatus: detail.resumeParseStatus,
    resumeProfile: detail.resumeProfile,
    resumeSummary: cleanString(detail.notes),
    resumeText,
    scope: detail.scope,
    targetRole: cleanString(detail.targetRole),
  };
}

export async function getResumePoolDetailForCopilot(input: {
  contextBindings?: ChatContextBindings;
  organizationId: string;
  requests: z.infer<typeof resumePoolDetailRequestSchema>[];
  visibilityScope: RecruitingVisibilityScope;
}): Promise<z.infer<typeof getResumePoolDetailOutputSchema>> {
  const parsed = getResumePoolDetailInputSchema.parse(input);
  if (input.visibilityScope.kind === "none") {
    return { missingIds: parsed.requests.map((request) => request.id), resumePoolItems: [] };
  }
  const results = await Promise.all(
    parsed.requests.map(async (request) => {
      const poolItemId = normalizeResumePoolItemId(request.id);
      if (!poolItemId) {
        return { requestedId: request.id, resumePoolItem: null };
      }
      const detail = await loadResumePoolItem({
        organizationId: input.organizationId,
        poolItemId,
        visibilityScope: input.visibilityScope,
      });
      if (!detail) {
        return { requestedId: request.id, resumePoolItem: null };
      }
      let resumeText: string | null = null;
      if (request.includeResumeText) {
        const [row] = await db
          .select({ resumeText: resumePoolItem.resumeText })
          .from(resumePoolItem)
          .where(
            and(
              eq(resumePoolItem.id, detail.id),
              eq(resumePoolItem.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        resumeText = row?.resumeText?.slice(0, 12_000) ?? null;
      }
      const jobBinding = await resolveConversationJobOverlay({
        boundJobDescriptionId: input.contextBindings?.resume_pool_item?.[detail.id],
        jobDescriptionId: detail.jobDescriptionId,
        jobDescriptionName: detail.jobDescriptionName,
        organizationId: input.organizationId,
      });
      return {
        requestedId: request.id,
        resumePoolItem: toResumePoolItemDetail(detail, resumeText, jobBinding),
      };
    }),
  );
  return {
    missingIds: results.flatMap((result) => (result.resumePoolItem ? [] : [result.requestedId])),
    resumePoolItems: results.flatMap((result) =>
      result.resumePoolItem ? [result.resumePoolItem] : [],
    ),
  };
}

type JobDescriptionWithDepartment = JobDescriptionRecord & { departmentName?: string | null };

function readDepartmentName(record: JobDescriptionWithDepartment): string | null {
  return record.departmentName ?? null;
}

function toJobDescriptionSummary(record: JobDescriptionWithDepartment) {
  return {
    code: record.code,
    departmentName: readDepartmentName(record),
    description: cleanString(record.prompt),
    id: record.id,
    name: record.name,
    prompt: record.prompt,
  };
}

function toJobDescriptionCitation(record: JobDescriptionRecord) {
  return {
    id: record.id,
    label: record.name,
    recordType: "job_description" as const,
    secondaryLabel: readDepartmentName(record),
  };
}

export async function searchJobDescriptionsForCopilot(
  input: z.infer<typeof searchJobDescriptionsInputSchema> & { organizationId: string },
): Promise<z.infer<typeof searchJobDescriptionsOutputSchema>> {
  const parsed = searchJobDescriptionsInputSchema.parse(input);
  const all = await listRecruitingJobDescriptions(input.organizationId);
  const query = parsed.query?.toLowerCase();
  const filtered = query
    ? all.filter((record) =>
        [record.name, record.prompt, record.departmentName]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(query)),
      )
    : all;
  const records = filtered.slice(0, parsed.limit ?? 5);
  return {
    citations: records.map(toJobDescriptionCitation),
    jobDescriptions: records.map(toJobDescriptionSummary),
  };
}

export function createRecruitingCopilotTools({
  bindingConsent = false,
  contextBindings = EMPTY_CHAT_CONTEXT_BINDINGS,
  conversationId,
  organizationId,
  visibilityScope,
}: {
  bindingConsent?: boolean;
  contextBindings?: ChatContextBindings;
  conversationId?: string | null;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}) {
  const actionProposalInputSchema = getRecruitingActionInputSchema(bindingConsent);

  return {
    get_job_description_detail: createTool({
      description: "一次读取当前 workspace 中 1 到 5 个岗位的完整描述，用于多人、多岗位匹配比较。",
      execute: async ({ ids }: z.infer<typeof getJobDescriptionDetailInputSchema>) => {
        const records = await Promise.all(
          ids.map((id) => loadRecruitingJobDescriptionById(organizationId, id)),
        );
        const found = records.flatMap((record) => (record ? [record] : []));
        return {
          citations: found.map(toJobDescriptionCitation),
          jobDescriptions: found.map(toJobDescriptionSummary),
          missingIds: ids.filter((_, index) => !records[index]),
        };
      },
      id: "get_job_description_detail",
      inputSchema: getJobDescriptionDetailInputSchema,
      outputSchema: getJobDescriptionDetailOutputSchema,
    }),
    get_resume_pool_detail: createTool({
      description:
        "一次读取当前 workspace 中 1 到 5 个人才库（resume pool）条目详情。每个 id 可为 uuid 或 pool:uuid；多人询问必须放在同一次 requests 调用中。若未绑定岗位且用户要求评价，先依据现有资料输出通用 Markdown 评价，再询问是否绑定；用户明确同意前不要调用 propose_recruiting_action。",
      execute: (input: z.infer<typeof getResumePoolDetailInputSchema>) =>
        getResumePoolDetailForCopilot({
          ...input,
          contextBindings,
          organizationId,
          visibilityScope,
        }),
      id: "get_resume_pool_detail",
      inputSchema: getResumePoolDetailInputSchema,
      outputSchema: getResumePoolDetailOutputSchema,
    }),
    get_resume_record_detail: createTool({
      description:
        "一次读取 1 到 5 人在当前 workspace 招聘台中的简历详情，以及数据库已有的旧版六维评分或新版结构化评分；多人询问必须放在同一次 requests 调用中。评价候选人时对每个 request 设置 includeResumeText=true。候选人已绑定岗位时，前端会主动展示数据库评分卡；jobDescriptionId 为 null 时先输出不写库的通用 Markdown 评价，再询问是否绑定。用户明确同意前不要调用 propose_recruiting_action，也不要把临时评价写回 resumeReview。",
      execute: (input: z.infer<typeof getResumeRecordDetailInputSchema>) =>
        getResumeRecordDetailForCopilot({
          ...input,
          contextBindings,
          organizationId,
          visibilityScope,
        }),
      id: "get_resume_record_detail",
      inputSchema: getResumeRecordDetailInputSchema,
      outputSchema: getResumeRecordDetailOutputSchema,
    }),
    propose_recruiting_action: createTool({
      description:
        "弹出需要用户批准的动作卡（前端会渲染）。bind_candidate_to_job / bind_pool_item_to_job 只能在已完成未绑定候选人的通用 Markdown 评价、并且用户随后明确同意绑定后调用。payload 分别包含 resumeRecordId 或 poolItemId，可预填用户指定或检索到的 jobDescriptionId；批准后只写入本对话分析上下文，不改招聘台、人才库或 resumeReview。推进阶段/生成面试题等写操作也用本工具。",
      execute: (input: z.infer<typeof proposeRecruitingActionInputSchema>) =>
        executeProposeRecruitingAction({
          contextBindings,
          conversationId,
          organizationId,
          proposalInput: input,
          visibilityScope,
        }),
      id: "propose_recruiting_action",
      inputSchema: actionProposalInputSchema,
      outputSchema: proposeRecruitingActionOutputSchema,
      requireApproval: true,
    }),
    search_job_descriptions: createTool({
      description:
        "在当前 workspace 中检索岗位信息，返回可引用的岗位摘要。为未绑定候选人推荐岗位时优先调用；拿到结果后同一轮继续调用 propose_recruiting_action 预填 jobDescriptionId。",
      execute: (input: z.infer<typeof searchJobDescriptionsInputSchema>) =>
        searchJobDescriptionsForCopilot({ ...input, organizationId }),
      id: "search_job_descriptions",
      inputSchema: searchJobDescriptionsInputSchema,
      outputSchema: searchJobDescriptionsOutputSchema,
    }),
    search_resume_records: createTool({
      description:
        "在当前 workspace 的招聘台中检索多个候选人，可同时按多个 jobDescriptionIds、阶段和技能过滤。默认返回候选人摘要卡片，不返回完整简历全文。",
      execute: (input: z.infer<typeof searchResumeRecordsInputSchema>) =>
        searchResumeRecordsForCopilot({ ...input, organizationId, visibilityScope }),
      id: "search_resume_records",
      inputSchema: searchResumeRecordsInputSchema,
      outputSchema: searchResumeRecordsOutputSchema,
    }),
  };
}
