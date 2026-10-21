import type { recruitingReadDependencies } from "./default-read-recruiting";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import type { WorkspaceAuthorizer } from "../../../access/workspace-access-policy";
import type { RecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import type {
  McpCandidateDetailCard,
  McpCandidateListCard,
} from "@app/shared/recruiting-mcp-cards";
import { McpAccessError } from "../access";
import { toMcpCandidateCard, toMcpCandidateDetailCard } from "./candidate-cards";
import type { CandidateUrlBuilder } from "./candidate-cards";

export interface McpReadContext {
  organizationId: string;
  authorize: WorkspaceAuthorizer;
  visibility: RecruitingVisibilityScope;
  /** 工作台候选人详情链接，供 MCP Apps 卡片跳转。 */
  candidateUrl?: CandidateUrlBuilder;
}

/** `data` 是给模型的文本结果，`card` 是给 MCP Apps 视图的 structuredContent。 */
export interface McpCardResult<Data, Card> {
  card: Card;
  data: Data;
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
        card: toMcpCandidateDetailCard(candidate, context.candidateUrl),
        data: {
          ...candidateSummary(candidate),
          email: candidate.candidateEmail,
          phone: candidate.candidatePhone,
          recruiterAssessment: candidate.hrResumeAssessment,
          resumeProfile: candidate.resumeProfile,
        },
      } satisfies McpCardResult<object, McpCandidateDetailCard>;
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
        card: {
          candidates: result.records.map((row) => toMcpCandidateCard(row, context.candidateUrl)),
          kind: "candidate_list",
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
        },
        data: {
          page: result.page,
          pageSize: result.pageSize,
          records: result.records.map(candidateSummary),
          total: result.total,
        },
      } satisfies McpCardResult<object, McpCandidateListCard>;
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
