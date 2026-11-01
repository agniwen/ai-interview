import type { RecruitingBoardView } from "@app/shared/recruiting-board";
import type { JobRecruitingStatus } from "@app/db-schema/job-recruiting-status";
import type { RecruitingLedgerParams } from "@/lib/client/api/endpoints/studio-resumes";

interface RecruitingLedgerSearchInput {
  createdFrom?: string;
  createdTo?: string;
  departmentId?: string[];
  jobDescriptionId?: string[];
  joiningFrom?: string;
  joiningTo?: string;
  page: number;
  recommendationLevel?: string[];
  recruitingStatus?: JobRecruitingStatus[];
  responsibleHrId?: string[];
  search?: string;
  sortBy: "createdAt" | "candidateName" | "joiningDate" | "updatedAt";
  sortOrder: "asc" | "desc";
  stage: RecruitingBoardView;
  view: "jobs" | "records";
}

export function buildRecruitingLedgerParams(
  search: RecruitingLedgerSearchInput,
): RecruitingLedgerParams {
  if (search.view === "jobs") {
    return {
      departmentIds: search.departmentId,
      jobDescriptionIds: search.jobDescriptionId,
      page: 1,
      pageSize: 20,
      recruitingStatuses: search.recruitingStatus,
    };
  }
  return {
    boardView: search.stage,
    createdFrom: search.createdFrom,
    createdTo: search.createdTo,
    departmentIds: search.departmentId,
    jobDescriptionIds: search.jobDescriptionId,
    joiningFrom: search.joiningFrom,
    joiningTo: search.joiningTo,
    page: search.page,
    pageSize: 20,
    recommendationLevels: search.recommendationLevel,
    recruitingStatuses: search.recruitingStatus,
    responsibleHrIds: search.responsibleHrId,
    search: search.search,
    sortBy: search.sortBy,
    sortOrder: search.sortOrder,
  };
}
