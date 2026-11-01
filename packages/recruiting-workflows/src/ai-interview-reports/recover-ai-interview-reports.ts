import { defaultAgentReportDependencies } from "./default-agent-report-dependencies";
import { retryAgentReportReceipts } from "./report-inbox";

export function recoverAiInterviewReports(): Promise<void> {
  return retryAgentReportReceipts(defaultAgentReportDependencies);
}
