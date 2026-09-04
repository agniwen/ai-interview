import { requestMeetingLiveSummary } from "@/lib/client/meetings";
import { resolveActiveWorkspace } from "@/lib/client/workspace";
import { createMeetingLiveSummaryController } from "./live-summary-controller";

export const meetingLiveSummary = createMeetingLiveSummaryController({
  provider: {
    summarize: async (request, signal) => {
      const workspace = await resolveActiveWorkspace();
      if (!workspace) {
        throw new Error("当前没有可用工作区");
      }
      return requestMeetingLiveSummary(workspace.slug, request, signal);
    },
  },
});
