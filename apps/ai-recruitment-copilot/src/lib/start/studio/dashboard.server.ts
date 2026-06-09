import type { RecruitingDashboardMetrics } from "@arc/shared/studio-dashboard";
import { loadRecruitingDashboardMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";

export function loadStudioDashboardMetrics(
  workspaceId: string,
): Promise<RecruitingDashboardMetrics> {
  return loadRecruitingDashboardMetrics(workspaceId);
}
