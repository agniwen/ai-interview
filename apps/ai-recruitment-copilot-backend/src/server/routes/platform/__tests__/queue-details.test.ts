import { describe, expect, it } from "vitest";
import { mergeResumeParseQueueJobsWithResumeDetails } from "../queue-details";

describe("mergeResumeParseQueueJobsWithResumeDetails", () => {
  it("attaches resume-level parse details to queue jobs by item id", () => {
    const [record] = mergeResumeParseQueueJobsWithResumeDetails(
      [
        {
          attemptsMade: 1,
          attemptsStarted: 1,
          data: {
            batchId: "batch-1",
            itemId: "item-1",
            organizationId: "org-1",
            userId: "user-1",
          },
          failedReason: null,
          finishedOn: null,
          id: "item-1",
          name: "parse-resume-upload-item",
          processedBy: "worker-1",
          processedOn: "2026-06-15T10:00:00.000Z",
          progress: 0,
          returnvalue: null,
          state: "active",
          timestamp: "2026-06-15T09:59:00.000Z",
        },
      ],
      [
        {
          attemptCount: 2,
          batch: {
            failedCount: 0,
            processedCount: 3,
            status: "running",
            succeededCount: 3,
            target: "resume_pool",
            totalCount: 10,
          },
          batchId: "batch-1",
          candidateEmail: "candidate@example.com",
          candidateName: "候选人甲",
          errorMessage: null,
          fileSize: 1024,
          finishedAt: null,
          itemId: "item-1",
          itemStatus: "processing",
          organizationId: "org-1",
          organizationName: "测试组织",
          originalFileName: "候选人甲.pdf",
          poolItemId: "pool-1",
          poolScope: "public",
          poolStatus: "active",
          queuedAt: "2026-06-15T09:58:00.000Z",
          resumeParseError: null,
          resumeParseStatus: "processing",
          resumeRecordId: null,
          startedAt: "2026-06-15T10:00:00.000Z",
          targetRole: "前端工程师",
          userId: "user-1",
          userName: "上传人",
        },
      ],
    );

    expect(record?.resumeDetail).toMatchObject({
      candidateName: "候选人甲",
      itemId: "item-1",
      itemStatus: "processing",
      originalFileName: "候选人甲.pdf",
      resumeParseStatus: "processing",
    });
  });

  it("keeps resume detail empty when job data is not a resume parse payload", () => {
    const [record] = mergeResumeParseQueueJobsWithResumeDetails(
      [
        {
          attemptsMade: 0,
          attemptsStarted: null,
          data: { unexpected: true },
          failedReason: null,
          finishedOn: null,
          id: "job-1",
          name: "other-job",
          processedBy: null,
          processedOn: null,
          progress: null,
          returnvalue: null,
          state: "waiting",
          timestamp: null,
        },
      ],
      [],
    );

    expect(record?.resumeDetail).toBeNull();
  });
});
