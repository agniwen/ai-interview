import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { listResumeRecords } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import {
  listAllJobDescriptions,
  loadJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
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
  id: z.string(),
  jobDescriptionId: z.string().nullable(),
  jobDescriptionName: z.string().nullable(),
  keySkills: z.array(z.string()),
  notes: z.string().nullable(),
  pipelineStage: z.string(),
  resumeSummary: z.string().nullable(),
  targetRole: z.string().nullable(),
  updatedAt: z.string(),
  workYears: z.number().nullable(),
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
  retrievalMode: z.enum(["structured", "structured_text"]),
  total: z.number().int().nonnegative(),
});

export const getResumeRecordDetailInputSchema = z.object({
  id: z.string().min(1),
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

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toCandidateSummaryCard(record: ResumeLibraryListRecord) {
  return {
    candidateName: record.candidateName,
    id: record.id,
    jobDescriptionId: record.jobDescriptionId,
    jobDescriptionName: record.jobDescriptionName,
    keySkills: record.resumeSkills.slice(0, 8),
    notes: cleanString(record.notes),
    pipelineStage: record.pipelineStage,
    resumeSummary: cleanString(record.resumeSummary),
    targetRole: cleanString(record.targetRole),
    updatedAt: serializeDate(record.updatedAt),
    workYears: null,
  };
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
      pageSize: parsed.limit ?? 5,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
  );
  return {
    candidateSummaryCards: result.records.map(toCandidateSummaryCard),
    citations: result.records.map(toResumeCitation),
    retrievalMode: parsed.query ? "structured_text" : "structured",
    total: result.total,
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
        "在当前 workspace 的简历库中检索候选人。默认返回候选人摘要卡片，不返回完整简历全文。",
      execute: (input: z.infer<typeof searchResumeRecordsInputSchema>) =>
        searchResumeRecordsForCopilot({ ...input, organizationId }),
      id: "search_resume_records",
      inputSchema: searchResumeRecordsInputSchema,
      outputSchema: searchResumeRecordsOutputSchema,
    }),
  };
}
