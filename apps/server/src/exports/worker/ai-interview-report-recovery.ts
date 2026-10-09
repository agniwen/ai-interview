import { agentRouterDependencies } from "../../routes/agent/route-runtime";
import { retryAgentReportReceipts } from "../../routes/agent/report-inbox";

export function recoverAiInterviewReports(): Promise<void> {
  return retryAgentReportReceipts(agentRouterDependencies);
}
