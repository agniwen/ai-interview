import { describe, expect, it } from "vitest";
import {
  filterEnrichedResumeParseQueueJobRecords,
  mergeResumeParseQueueJobsWithResumeDetails,
} from "../queue-details";

function createQueueJob(itemId: string) {
  return {
    attemptsMade: 0,
    attemptsStarted: null,
    data: {
      batchId: "batch-1",
      itemId,
      organizationId: "org-1",
      userId: "user-1",
    },
    failedReason: null,
    finishedOn: null,
    id: itemId,
    name: "parse-resume-upload-item",
    processedBy: null,
    processedOn: null,
    progress: null,
    returnvalue: null,
    state: "waiting" as const,
    timestamp: null,
  };
}

function createResumeDetail(itemId: string, itemStatus: string, resumeParseStatus: string) {
  return {
    attemptCount: 1,
    batch: {
      failedCount: 0,
      processedCount: 0,
      status: "running",
      succeededCount: 0,
      target: "resume_pool",
      totalCount: 3,
    },
    batchId: "batch-1",
    candidateEmail: null,
    candidateName: null,
    errorMessage: null,
    fileSize: 1024,
    finishedAt: null,
    itemId,
    itemStatus,
    organizationId: "org-1",
    organizationName: "测试组织",
    organizationSlug: "test-org",
    originalFileName: `${itemId}.pdf`,
    poolItemId: "pool-1",
    poolScope: "private",
    poolStatus: "active",
    queuedAt: null,
    resumeParseError: null,
    resumeParseStatus,
    resumeRecordId: null,
    startedAt: null,
    targetRole: null,
    userEmail: "uploader@example.com",
    userId: "user-1",
    userImage: null,
    userName: "上传人",
  };
}

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
          organizationSlug: "test-org",
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
          userEmail: "uploader@example.com",
          userId: "user-1",
          userImage: "https://example.com/avatar.png",
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
    expect(record?.organization).toEqual({
      id: "org-1",
      name: "测试组织",
      slug: "test-org",
    });
    expect(record?.triggeredBy).toEqual({
      email: "uploader@example.com",
      id: "user-1",
      image: "https://example.com/avatar.png",
      name: "上传人",
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

describe("filterEnrichedResumeParseQueueJobRecords", () => {
  it("filters queue jobs by upload task status and parse status", () => {
    const records = mergeResumeParseQueueJobsWithResumeDetails(
      [
        createQueueJob("item-1"),
        createQueueJob("item-2"),
        createQueueJob("item-3"),
        {
          ...createQueueJob("job-without-detail"),
          data: { unexpected: true },
        },
      ],
      [
        createResumeDetail("item-1", "processing", "processing"),
        createResumeDetail("item-2", "succeeded", "ready"),
        createResumeDetail("item-3", "failed", "failed"),
      ],
    );

    expect(
      filterEnrichedResumeParseQueueJobRecords(records, {
        parseStatus: "processing",
        uploadStatus: "processing",
      }).map((record) => record.id),
    ).toEqual(["item-1"]);
    expect(
      filterEnrichedResumeParseQueueJobRecords(records, {
        parseStatus: "ready",
        uploadStatus: "all",
      }).map((record) => record.id),
    ).toEqual(["item-2"]);
    expect(
      filterEnrichedResumeParseQueueJobRecords(records, {
        parseStatus: "all",
        uploadStatus: "failed",
      }).map((record) => record.id),
    ).toEqual(["item-3"]);
    expect(
      filterEnrichedResumeParseQueueJobRecords(records, {
        parseStatus: "all",
        uploadStatus: "all",
      }).map((record) => record.id),
    ).toEqual(["item-1", "item-2", "item-3", "job-without-detail"]);
  });
});
