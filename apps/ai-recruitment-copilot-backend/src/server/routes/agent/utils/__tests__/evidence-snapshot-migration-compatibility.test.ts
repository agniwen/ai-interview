import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
  hashSnapshotPayload: vi.fn(),
  loadActiveInterviewContextSnapshot: vi.fn(),
  loadSubmissionsByInterview: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: mocks.db,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/submissions",
  () => ({
    loadSubmissionsByInterview: mocks.loadSubmissionsByInterview,
  }),
);

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots",
  () => ({
    hashSnapshotPayload: mocks.hashSnapshotPayload,
    loadActiveInterviewContextSnapshot: mocks.loadActiveInterviewContextSnapshot,
  }),
);

// oxlint-disable-next-line import/first -- module must load after mocked DB boundary
import { createInterviewEvidenceSnapshot } from "../evidence-snapshot";

function selectResult(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

describe("createInterviewEvidenceSnapshot migration compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const generatedAt = new Date("2026-07-27T04:00:00.000Z");
    const conversation = {
      lastSyncedAt: generatedAt,
      organizationId: "org-1",
      recordingDurationSecs: null,
      recordingEgressId: null,
      recordingFileKey: null,
      recordingStatus: null,
      scheduleEntryId: "round-1",
      transcript: [{ message: "候选人回答", role: "user" }],
      updatedAt: generatedAt,
      webhookReceivedAt: generatedAt,
    };

    mocks.db.select
      .mockImplementationOnce((fields?: Record<string, unknown>) => {
        if (
          !fields ||
          Object.keys(fields).some((field) => field.toLowerCase().startsWith("keyinformation"))
        ) {
          throw Object.assign(new Error('column "key_information" does not exist'), {
            code: "42703",
          });
        }
        return selectResult([conversation]);
      })
      .mockImplementationOnce(() => selectResult([]));
    mocks.db.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            contentHash: "snapshot-hash",
            contextSnapshotId: "context-1",
            conversationId: "conversation-1",
            createdAt: generatedAt,
            id: "evidence-1",
            interviewRecordId: "interview-1",
            organizationId: "org-1",
            payload: {
              context: {},
              contextSnapshotId: "context-1",
              conversationId: "conversation-1",
              formSubmissions: [],
              generatedAt: generatedAt.toISOString(),
              interviewRecordId: "interview-1",
              recording: {
                durationSecs: null,
                egressId: null,
                fileKey: null,
                status: null,
              },
              scheduleEntryId: "round-1",
              schemaVersion: 1,
              transcript: conversation.transcript,
            },
            scheduleEntryId: "round-1",
          },
        ]),
      })),
    });
    mocks.hashSnapshotPayload.mockReturnValue("snapshot-hash");
    mocks.loadActiveInterviewContextSnapshot.mockResolvedValue({
      id: "context-1",
      payload: {},
    });
    mocks.loadSubmissionsByInterview.mockResolvedValue([]);
  });

  it("builds the snapshot without selecting newly added conversation columns", async () => {
    await expect(
      createInterviewEvidenceSnapshot({
        conversationId: "conversation-1",
        interviewRecordId: "interview-1",
      }),
    ).resolves.toMatchObject({
      conversationId: "conversation-1",
      id: "evidence-1",
    });
  });
});
