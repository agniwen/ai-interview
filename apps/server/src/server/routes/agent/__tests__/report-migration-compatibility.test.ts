import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentRouter } from "../route";
import type { AgentRouterDependencies } from "../route";

const keyInformationJobs: { conversationId: string; interviewRecordId: string }[] = [];
const tags: string[] = [];
const calls = {
  evidenceSnapshots: 0,
  keyInformationJobs,
  legacySql: 0,
  summaryJobs: 0,
  tags,
};

const receiveReport = vi.fn(async () => {});
let keyInformationColumnsAvailable = false;

const dependencies: AgentRouterDependencies = {
  cacheTags: {
    interviewConversations: "interview-conversations",
    interviewConversationsByRecord: (id) => `interview-conversations:${id}`,
    studioInterviews: (id) => `studio-interviews:${id}`,
  },
  createInterviewEvidenceSnapshot: () => {
    calls.evidenceSnapshots += 1;
    return Promise.resolve();
  },
  findExistingTranscript: () => Promise.resolve(null),
  hasKeyInformationColumns: () => Promise.resolve(keyInformationColumnsAvailable),
  listKeyInformationRetryCandidates: () => Promise.resolve([]),
  listSummaryRetryCandidates: () => Promise.resolve([]),
  notifyInterviewSummaryReady: () => Promise.resolve(),
  persistCheckpoint: () => Promise.resolve(),
  persistReport: ({ keyInformationColumnsAvailable: available }) => {
    if (!available) {
      calls.legacySql += 1;
    }
    return Promise.resolve(true);
  },
  receiveReport,
  resolveOrgFromInterview: () => Promise.resolve("org-1"),
  retryFailedInterviewSummaryNotifications: () => Promise.resolve({ retried: 0 }),
  runKeyInformationJob: (options) => {
    calls.keyInformationJobs.push(options);
    return Promise.resolve();
  },
  runSummaryJob: () => {
    calls.summaryJobs += 1;
    return Promise.resolve();
  },
  safeUpdateTag: (tag) => {
    calls.tags.push(tag);
  },
};

const agentRouter = createAgentRouter(dependencies);

function postReport() {
  return agentRouter.request("/report", {
    body: JSON.stringify({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
      scheduleEntryId: "round-1",
      status: "completed",
      transcript: [
        {
          message: "我负责过招聘系统的前端架构。",
          role: "user",
          timeInCallSecs: 12,
        },
      ],
    }),
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Secret": "test-agent-secret",
    },
    method: "POST",
  });
}

describe("POST /report durable receipt contract", () => {
  beforeEach(() => {
    receiveReport.mockReset();
    process.env.AGENT_CALLBACK_SECRET = "test-agent-secret";
    keyInformationColumnsAvailable = false;
  });
  it("acknowledges through the durable receiver without querying optional projection columns", async () => {
    const response = await postReport();
    expect(response.status).toBe(201);
    expect(receiveReport).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conversation-1" }),
      dependencies,
    );
    expect(calls.legacySql).toBe(0);
    expect(calls.evidenceSnapshots).toBe(0);
  });
  it("does not acknowledge when raw receipt persistence fails", async () => {
    receiveReport.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await postReport();
    expect(response.status).toBe(500);
  });
});
