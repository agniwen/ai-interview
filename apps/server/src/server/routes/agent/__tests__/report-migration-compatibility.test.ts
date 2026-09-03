import { beforeEach, describe, expect, it } from "vitest";
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
    return Promise.resolve();
  },
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

describe("POST /report migration compatibility", () => {
  beforeEach(() => {
    calls.evidenceSnapshots = 0;
    calls.legacySql = 0;
    calls.keyInformationJobs.length = 0;
    calls.summaryJobs = 0;
    calls.tags.length = 0;
    process.env.AGENT_CALLBACK_SECRET = "test-agent-secret";
    keyInformationColumnsAvailable = false;
  });

  it("still ingests the report before key-information columns are migrated", async () => {
    const response = await postReport();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      conversationId: "conversation-1",
      success: true,
    });
    expect(calls.keyInformationJobs).toHaveLength(0);
    expect(calls.legacySql).toBe(1);
    expect(calls.evidenceSnapshots).toBe(1);
  });

  it("starts key-information extraction after the columns are available", async () => {
    keyInformationColumnsAvailable = true;

    const response = await postReport();

    expect(response.status).toBe(201);
    expect(calls.legacySql).toBe(0);
    expect(calls.keyInformationJobs).toEqual([
      {
        conversationId: "conversation-1",
        interviewRecordId: "interview-1",
      },
    ]);
  });
});
