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

describe("InterviewWorkflowService form submissions", () => {
  it("returns the immutable template snapshot required by interview details", async () => {
    let selectCall = 0;
    const submission = {
      answers: { "question-1": "两周内" },
      id: "submission-1",
      interviewRecordId: "candidate-1",
      submittedAt: new Date("2026-09-01T12:00:00.000Z"),
      templateId: "template-1",
      versionId: "version-1",
    };
    const snapshot = {
      description: null,
      jobDescriptionIds: [],
      questions: [],
      scope: "global",
      templateId: "template-1",
      title: "候选人信息",
    };
    const select = vi.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [{ candidate: { id: "candidate-1" }, round: {} }],
              }),
            }),
          }),
        };
      }

      let joinedTemplateVersion = false;
      const query = {
        innerJoin: () => {
          joinedTemplateVersion = true;
          return query;
        },
        orderBy: async () => [
          joinedTemplateVersion ? { ...submission, snapshot, version: 1 } : submission,
        ],
        where: () => query,
      };
      return { from: () => query };
    });
    const service = new InterviewWorkflowService(
      { select } as never,
      {} as WorkspaceObjectStoragePort,
      {} as ResumeUploadBatchService,
    );

    await expect(service.formSubmissions("organization-1", "round-1")).resolves.toEqual({
      submissions: [
        {
          ...submission,
          snapshot,
          submittedAt: "2026-09-01T12:00:00.000Z",
          version: 1,
        },
      ],
    });
  });
});
