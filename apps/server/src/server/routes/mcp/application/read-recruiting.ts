import type { recruitingReadDependencies } from "./default-read-recruiting";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import type { WorkspaceAuthorizer } from "../../../access/workspace-access-policy";
import type { RecruitingVisibilityScope } from "../../../access/recruiting-visibility";
import { McpAccessError } from "../access";

export interface McpReadContext {
  organizationId: string;
  authorize: WorkspaceAuthorizer;
  visibility: RecruitingVisibilityScope;
}

function candidateSummary(row: ResumeLibraryListRecord) {
  return {
    createdAt: row.createdAt,
    id: row.id,
    jobId: row.jobDescriptionId,
    jobName: row.jobDescriptionName,
    name: row.candidateName,
    outcome: row.outcome,
    pipelineStage: row.pipelineStage,
    recommendation: row.qualitativeRecommendationLevel,
    summary: row.qualitativeResumeSummary ?? row.resumeSummary,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt,
  };
}

export function createRecruitingReader(
  context: McpReadContext,
  deps: typeof recruitingReadDependencies,
) {
  const requireCandidate = async (id: string) => {
    const candidate = await deps.loadCandidate(id, context.organizationId, context.visibility);
    if (!candidate) {
      throw new McpAccessError("候选人不存在或不可访问。", 404);
    }
    return candidate;
  };
  const reportContext = async (candidateId: string) => {
    await requireCandidate(candidateId);
    return {
      candidateId,
      includeHuman: await context.authorize({ action: "read", resource: "humanInterview" }),
      organizationId: context.organizationId,
    };
  };
  return {
    async getCandidate(id: string) {
      const candidate = await requireCandidate(id);
      return {
        ...candidateSummary(candidate),
        email: candidate.candidateEmail,
        phone: candidate.candidatePhone,
        recruiterAssessment: candidate.hrResumeAssessment,
        resumeProfile: candidate.resumeProfile,
      };
    },
    async getJob(id: string) {
      const job = await deps.loadJob(context.organizationId, id);
      if (!job) {
        throw new McpAccessError("岗位不存在或不可访问。", 404);
      }
      return {
        code: job.code,
        departmentId: job.departmentId,
        id: job.id,
        jd: job.prompt,
        lifecycleStatus: job.lifecycleStatus,
        name: job.name,
        updatedAt: job.updatedAt,
      };
    },
    async getReport(input: { candidateId: string; reportId: string; kind: "ai" | "human" }) {
      const report = await deps.getReport(
        await reportContext(input.candidateId),
        input.reportId,
        input.kind,
      );
      if (!report) {
        throw new McpAccessError("报告不存在或不可访问。", 404);
      }
      return report;
    },
    async listReports(input: { candidateId: string; page: number; pageSize: number }) {
      return deps.listReports(await reportContext(input.candidateId), input.page, input.pageSize);
    },
    async searchCandidates(input: {
      search?: string;
      jobId?: string;
      pipelineStage?: string;
      page: number;
      pageSize: number;
    }) {
      const result = await deps.searchCandidates(
        context.organizationId,
        {
          jobDescriptionIds: input.jobId ? [input.jobId] : undefined,
          pipelineStages: input.pipelineStage ? [input.pipelineStage] : undefined,
          search: input.search,
        },
        input,
        context.visibility,
      );
      return {
        page: result.page,
        pageSize: result.pageSize,
        records: result.records.map(candidateSummary),
        total: result.total,
      };
    },
    async searchJobs(input: { search?: string; page: number; pageSize: number }) {
      const result = await deps.searchJobs(
        context.organizationId,
        { search: input.search },
        { page: String(input.page), pageSize: String(input.pageSize) },
      );
      return {
        page: result.page,
        pageSize: result.pageSize,
        records: result.records.map((row) => ({
          code: row.code,
          id: row.id,
          lifecycleStatus: row.lifecycleStatus,
          name: row.name,
        })),
        total: result.total,
      };
    },
  };
}
