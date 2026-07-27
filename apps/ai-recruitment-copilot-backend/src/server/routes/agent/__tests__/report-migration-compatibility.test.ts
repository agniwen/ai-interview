import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// oxlint-disable promise/prefer-await-to-callbacks -- the fake transaction executes Drizzle's callback API.

const mocks = vi.hoisted(() => {
  const undefinedColumnError = Object.assign(
    new Error('column "key_information_status" does not exist'),
    { code: "42703" },
  );

  return {
    createInterviewEvidenceSnapshot: vi.fn(),
    db: {
      delete: vi.fn(),
      insert: vi.fn(),
      select: vi.fn(),
      transaction: vi.fn(),
      update: vi.fn(),
    },
    executeLegacySql: vi.fn(),
    runKeyInformationJob: vi.fn(),
    runSummaryJob: vi.fn(),
    safeUpdateTag: vi.fn(),
    undefinedColumnError,
  };
});

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: mocks.db,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/cache-tags", () => ({
  cacheTags: {
    interviewConversations: "interview-conversations",
    interviewConversationsByRecord: (id: string) => `interview-conversations:${id}`,
    studioInterviews: (id: string) => `studio-interviews:${id}`,
  },
  safeUpdateTag: mocks.safeUpdateTag,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot", () => ({
  createInterviewEvidenceSnapshot: mocks.createInterviewEvidenceSnapshot,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-key-information-job",
  () => ({
    runKeyInformationJob: mocks.runKeyInformationJob,
  }),
);

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-summary-job",
  () => ({
    runSummaryJob: mocks.runSummaryJob,
  }),
);

// oxlint-disable-next-line import/first -- route must load after mocked boundaries
import { agentRouter } from "../route";

let keyInformationColumnsAvailable = false;

function selectResult(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  return {
    from: vi.fn(() => ({
      limit,
      where: vi.fn(() => ({
        limit,
      })),
    })),
  };
}

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
    vi.clearAllMocks();
    process.env.AGENT_CALLBACK_SECRET = "test-agent-secret";
    keyInformationColumnsAvailable = false;

    mocks.createInterviewEvidenceSnapshot.mockResolvedValue({});
    mocks.executeLegacySql.mockImplementation((query: SQL) => {
      const generatedSql = new PgDialect().sqlToQuery(query).sql;
      if (generatedSql.includes("key_information")) {
        return Promise.reject(mocks.undefinedColumnError);
      }
      return Promise.resolve();
    });
    mocks.db.select
      .mockReturnValueOnce(selectResult([{ organizationId: "org-1" }]))
      .mockReturnValueOnce(selectResult([]))
      .mockImplementation(() => {
        if (keyInformationColumnsAvailable) {
          return selectResult([]);
        }
        throw mocks.undefinedColumnError;
      });

    mocks.db.transaction.mockImplementation(async (callback) => {
      const tx = {
        delete: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
        execute: mocks.executeLegacySql,
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(() =>
              keyInformationColumnsAvailable
                ? Promise.resolve()
                : Promise.reject(mocks.undefinedColumnError),
            ),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve()),
          })),
        })),
      };
      return await callback(tx);
    });
  });

  it("still ingests the report before key-information columns are migrated", async () => {
    const response = await postReport();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      conversationId: "conversation-1",
      success: true,
    });
    expect(mocks.runKeyInformationJob).not.toHaveBeenCalled();
    expect(mocks.executeLegacySql).toHaveBeenCalledOnce();
  });

  it("starts key-information extraction after the columns are available", async () => {
    keyInformationColumnsAvailable = true;

    const response = await postReport();

    expect(response.status).toBe(201);
    expect(mocks.executeLegacySql).not.toHaveBeenCalled();
    expect(mocks.runKeyInformationJob).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });
  });
});
