import { createTool } from "@mastra/core/tools";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
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
  listAllJobDescriptions,
  loadJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";

const MAX_SEARCH_LIMIT = 10;
const MAX_COMPARISON_CANDIDATES = 5;

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
  resumeProfile: z.unknown().nullable(),
  resumeSummary: z.string().nullable(),
  resumeText: z.string().nullable(),
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
  payload: z.record(z.string(), z.unknown()),
  title: z.string(),
  type: z.enum([
    "bind_candidate_to_job",
    "advance_candidate_stage",
    "generate_interview_questions",
  ]),
});

export const searchResumeRecordsInputSchema = z.object({
  jobDescriptionId: z.string().min(1).optional(),
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

export const getResumeRecordDetailInputSchema = z.object({
  id: z.string().min(1),
  includeResumeText: z.boolean().optional(),
});

export const getResumeRecordDetailOutputSchema = z.object({
  resumeRecord: resumeRecordDetailSchema.nullable(),
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
  id: z.string().min(1),
});

export const proposeRecruitingActionInputSchema = z.object({
  explanation: z.string().trim().min(1).max(600),
  payload: z.record(z.string(), z.unknown()),
  title: z.string().trim().min(1).max(120),
  type: recruitingActionProposalSchema.shape.type,
});

export const proposeRecruitingActionOutputSchema = z.object({
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

function readResumeReviewConclusion(value: unknown): string | null {
  if (!(typeof value === "object" && value !== null && "overall" in value)) {
    return null;
  }
  const { overall } = value;
  if (!(typeof overall === "object" && overall !== null && "conclusion" in overall)) {
    return null;
  }
  return typeof overall.conclusion === "string" ? cleanString(overall.conclusion) : null;
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
  input: z.infer<typeof searchResumeRecordsInputSchema> & { organizationId: string },
  deps?: SearchResumeRecordsDeps,
): Promise<z.infer<typeof searchResumeRecordsOutputSchema>> {
  const parsed = searchResumeRecordsInputSchema.parse(input);
  const resumeRecordsDeps = deps ?? { listResumeRecords };
  const limit = parsed.limit ?? 5;
  const result = await resumeRecordsDeps.listResumeRecords(
    input.organizationId,
    {
      jobDescriptionIds: parsed.jobDescriptionId ? [parsed.jobDescriptionId] : null,
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
  );
  const semanticCards = parsed.query
    ? // oxlint-disable-next-line no-use-before-define -- Default dependency is declared below the public tool entrypoint.
      await (resumeRecordsDeps.semanticSearch ?? searchSemanticResumeRecords)({
        jobDescriptionId: parsed.jobDescriptionId,
        limit,
        organizationId: input.organizationId,
        pipelineStages: parsed.pipelineStages,
        query: parsed.query,
        skills: parsed.skills,
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
    jobDescriptionId?: string;
    pipelineStages?: string[];
    skills?: string[];
  },
) {
  if (filters.jobDescriptionId && record.jobDescriptionId !== filters.jobDescriptionId) {
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
}: {
  ids: string[];
  organizationId: string;
}) {
  if (ids.length === 0) {
    return [];
  }
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
        notInArray(studioInterview.status, ["archived"]),
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
        workYears:
          row.resumeProfile && typeof row.resumeProfile.workYears === "number"
            ? row.resumeProfile.workYears
            : null,
      },
    ];
  });
}

export async function searchSemanticResumeRecords(input: {
  jobDescriptionId?: string;
  limit: number;
  organizationId: string;
  pipelineStages?: string[];
  query: string;
  skills?: string[];
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
    const cards = await loadSemanticCandidateCards({ ids, organizationId: input.organizationId });
    return cards
      .filter((record) =>
        matchesSemanticFilters(record, {
          jobDescriptionId: input.jobDescriptionId,
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

export async function getResumeRecordDetailForCopilot(input: {
  id: string;
  includeResumeText?: boolean;
  organizationId: string;
}): Promise<z.infer<typeof getResumeRecordDetailOutputSchema>> {
  const parsed = getResumeRecordDetailInputSchema.parse(input);
  const [record] = await db
    .select({
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      interviewQuestions: studioInterview.interviewQuestions,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: studioInterview.notes,
      pipelineStage: studioInterview.pipelineStage,
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
      resumeText: studioInterview.resumeText,
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
        eq(studioInterview.id, parsed.id),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!record) {
    return { resumeRecord: null };
  }
  return {
    resumeRecord: {
      candidateName: record.candidateName,
      citation: {
        id: record.id,
        label: record.candidateName,
        recordType: "resume_record",
        secondaryLabel: record.jobDescriptionName,
      },
      id: record.id,
      interviewQuestions: record.interviewQuestions ?? [],
      jobDescriptionId: record.jobDescriptionId,
      jobDescriptionName: record.jobDescriptionName,
      notes: cleanString(record.notes),
      pipelineStage: record.pipelineStage,
      resumeProfile: record.resumeProfile,
      resumeSummary: readResumeReviewConclusion(record.resumeReview) ?? cleanString(record.notes),
      resumeText: parsed.includeResumeText ? (record.resumeText?.slice(0, 12_000) ?? null) : null,
      targetRole: cleanString(record.targetRole),
    },
  };
}

function readDepartmentName(record: JobDescriptionRecord): string | null {
  return "departmentName" in record && typeof record.departmentName === "string"
    ? record.departmentName
    : null;
}

function toJobDescriptionSummary(record: JobDescriptionRecord) {
  return {
    code: record.code,
    departmentName: readDepartmentName(record),
    description: cleanString(record.description),
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
  const all = await listAllJobDescriptions(input.organizationId);
  const query = parsed.query?.toLowerCase();
  const filtered = query
    ? all.filter((record) =>
        [record.name, record.description, record.prompt, record.departmentName]
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

export function createRecruitingActionProposal(
  input: z.infer<typeof proposeRecruitingActionInputSchema>,
): z.infer<typeof proposeRecruitingActionOutputSchema> {
  const parsed = proposeRecruitingActionInputSchema.parse(input);
  return {
    proposal: {
      ...parsed,
      id: crypto.randomUUID(),
    },
  };
}

export function createRecruitingCopilotTools({ organizationId }: { organizationId: string }) {
  return {
    get_job_description_detail: createTool({
      description: "读取当前 workspace 中某个岗位的完整岗位描述，用于解释岗位匹配。",
      execute: async ({ id }: z.infer<typeof getJobDescriptionDetailInputSchema>) => {
        const record = await loadJobDescriptionById(organizationId, id);
        return record
          ? {
              citation: toJobDescriptionCitation(record),
              jobDescription: toJobDescriptionSummary(record),
            }
          : { citation: null, jobDescription: null };
      },
      id: "get_job_description_detail",
      inputSchema: getJobDescriptionDetailInputSchema,
    }),
    get_resume_record_detail: createTool({
      description:
        "读取当前 workspace 中某个候选人的简历详情。默认返回结构化画像；只有需要逐段引用时才请求 resumeText。",
      execute: (input: z.infer<typeof getResumeRecordDetailInputSchema>) =>
        getResumeRecordDetailForCopilot({ ...input, organizationId }),
      id: "get_resume_record_detail",
      inputSchema: getResumeRecordDetailInputSchema,
      outputSchema: getResumeRecordDetailOutputSchema,
    }),
    propose_recruiting_action: createTool({
      description: "创建一个需要用户确认的招聘动作建议卡片。此工具只返回建议，不修改任何系统数据。",
      execute: (input: z.infer<typeof proposeRecruitingActionInputSchema>) =>
        Promise.resolve(createRecruitingActionProposal(input)),
      id: "propose_recruiting_action",
      inputSchema: proposeRecruitingActionInputSchema,
      outputSchema: proposeRecruitingActionOutputSchema,
    }),
    search_job_descriptions: createTool({
      description: "在当前 workspace 中检索岗位信息，返回可引用的岗位摘要。",
      execute: (input: z.infer<typeof searchJobDescriptionsInputSchema>) =>
        searchJobDescriptionsForCopilot({ ...input, organizationId }),
      id: "search_job_descriptions",
      inputSchema: searchJobDescriptionsInputSchema,
      outputSchema: searchJobDescriptionsOutputSchema,
    }),
    search_resume_records: createTool({
      description:
        "在当前 workspace 的招聘台中检索候选人。默认返回候选人摘要卡片，不返回完整简历全文。",
      execute: (input: z.infer<typeof searchResumeRecordsInputSchema>) =>
        searchResumeRecordsForCopilot({ ...input, organizationId }),
      id: "search_resume_records",
      inputSchema: searchResumeRecordsInputSchema,
      outputSchema: searchResumeRecordsOutputSchema,
    }),
  };
}
