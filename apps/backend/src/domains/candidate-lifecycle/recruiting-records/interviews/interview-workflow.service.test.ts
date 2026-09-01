/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion -- The focused database-port fake captures Drizzle's selected SQL decoders without recreating the full database surface. */
import { describe, expect, it, vi } from "vitest";
import type { ResumeUploadBatchService } from "../../intake/upload-batches/resume-upload-batch.service.js";
import type { WorkspaceObjectStoragePort } from "../../../../infrastructure/workspace/workspace.ports.js";
import { InterviewWorkflowService } from "./interview-workflow.service.js";

describe("InterviewWorkflowService round email summary", () => {
  it("maps PostgreSQL count strings to numbers before response serialization", async () => {
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          groupBy: async () => [
            {
              failed: "2",
              lastSentAt: null,
              roundId: "round-1",
              sent: "3",
            },
          ],
        }),
      }),
    }));
    const database = { select } as never;
    const service = new InterviewWorkflowService(
      database,
      {} as WorkspaceObjectStoragePort,
      {} as ResumeUploadBatchService,
    );

    await expect(service.roundEmailSummary("organization-1")).resolves.toEqual({
      records: [
        {
          failed: 2,
          lastSentAt: null,
          roundId: "round-1",
          sent: 3,
        },
      ],
    });
  });
});
