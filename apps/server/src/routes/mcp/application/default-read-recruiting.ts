import {
  loadManagedJobDescriptionById,
  queryPaginatedJobDescriptions,
} from "@app/resume-processing/review/support/job-descriptions-dao";
import {
  loadResumeDetail,
  queryPaginatedResumeRecords,
} from "../../studio/routes/resumes/dao/resumes";
import {
  getMcpInterviewReport,
  listMcpInterviewReports,
} from "../../studio/routes/interviews/dao/mcp-reports";
export const recruitingReadDependencies = {
  getReport: getMcpInterviewReport,
  listReports: listMcpInterviewReports,
  loadCandidate: loadResumeDetail,
  loadJob: loadManagedJobDescriptionById,
  searchCandidates: queryPaginatedResumeRecords,
  searchJobs: queryPaginatedJobDescriptions,
};
