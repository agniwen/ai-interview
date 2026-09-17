import { agentRouterDependencies } from "../../server/routes/agent/route-runtime";
import { retryAgentReportReceipts } from "../../server/routes/agent/report-inbox";

export function recoverAiInterviewReports(): Promise<void> {
  return retryAgentReportReceipts(agentRouterDependencies);
}
