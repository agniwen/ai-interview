import {
  appendHumanTranscriptionEvents,
  claimHumanTranscription,
} from "./routes/human-transcription/dao";
import { createHumanTranscriptionRouter } from "./routes/human-transcription/route";
import { defaultAgentReportDependencies } from "@app/recruiting-workflows/ai-interview-reports/default-agent-report-dependencies";
import { createAgentRouter } from "./route";

export const agentRouter = createAgentRouter(defaultAgentReportDependencies).route(
  "/human-transcription",
  createHumanTranscriptionRouter({
    append: appendHumanTranscriptionEvents,
    claim: claimHumanTranscription,
  }),
);
