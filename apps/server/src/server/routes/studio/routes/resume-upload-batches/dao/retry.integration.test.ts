import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  organization,
  resumePoolItem,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
  user,
} from "@app/db-schema/schema";
import { claimFailedResumeParseRetry } from "./retry";

const ORGANIZATION_ID = "resume_retry_unlimited_org";
const USER_ID = "resume_retry_unlimited_user";
const NOW = new Date("2026-08-25T03:00:00.000Z");

async function cleanup() {
  await db
    .delete(recruitingUploadBatchItem)
    .where(eq(recruitingUploadBatchItem.organizationId, ORGANIZATION_ID));
  await db
    .delete(recruitingUploadBatch)
    .where(eq(recruitingUploadBatch.organizationId, ORGANIZATION_ID));
  await db.delete(resumePoolItem).where(eq(resumePoolItem.organizationId, ORGANIZATION_ID));
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORGANIZATION_ID));
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "resume-retry-unlimited@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "resume-retry-unlimited",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORGANIZATION_ID,
    name: "Resume Retry Unlimited",
    slug: "resume-retry-unlimited",
  });
});

afterAll(cleanup);

async function insertFailedBatchItem(input: {
  batchId: string;
  contentHash: string;
  itemId: string;
  poolItemId?: string;
  resumeRecordId?: string;
  target: "resume_library" | "resume_pool";
}) {
  const fileName = `${input.target}-unlimited-retry.pdf`;
  const storageKey = `attachments/${input.target}/${fileName}`;
  await db.insert(recruitingUploadBatch).values({
    completedAt: NOW,
    createdAt: NOW,
    createdBy: USER_ID,
    dedupPolicy: "create",
    failedCount: 1,
    id: input.batchId,
    jdMode: "none",
    organizationId: ORGANIZATION_ID,
    processedCount: 1,
    resumePoolScope: input.target === "resume_pool" ? "private" : undefined,
    status: "completed",
    target: input.target,
    totalCount: 1,
    updatedAt: NOW,
  });
  await db.insert(recruitingUploadBatchItem).values({
    attemptCount: 4,
    batchId: input.batchId,
    contentHash: input.contentHash,
    errorMessage: "解析再次失败",
    fileSize: 1024,
    finishedAt: NOW,
    id: input.itemId,
    orderIndex: 0,
    organizationId: ORGANIZATION_ID,
    originalFileName: fileName,
    poolItemId: input.poolItemId,
    recruitingRecordId: input.resumeRecordId,
    status: "failed",
    storageKey,
  });
}

async function expectBatchItemRequeued(itemId: string) {
  const [batchItem] = await db
    .select({
      attemptCount: recruitingUploadBatchItem.attemptCount,
      status: recruitingUploadBatchItem.status,
    })
    .from(recruitingUploadBatchItem)
    .where(eq(recruitingUploadBatchItem.id, itemId));
  expect(batchItem).toEqual({ attemptCount: 4, status: "pending" });
}

describe("claimFailedResumeParseRetry", () => {
  it("requeues a failed talent-pool record after multiple previous attempts", async () => {
    const poolItemId = "resume_retry_unlimited_pool_item";
    await db.insert(resumePoolItem).values({
      candidateName: "人才库重试候选人",
      createdAt: NOW,
      createdBy: USER_ID,
      id: poolItemId,
      organizationId: ORGANIZATION_ID,
      resumeContentHash: "hash-resume-pool-unlimited-retry",
      resumeFileName: "resume_pool-unlimited-retry.pdf",
      resumeParseError: "解析再次失败",
      resumeParseStatus: "failed",
      resumeStorageKey: "attachments/resume_pool/resume_pool-unlimited-retry.pdf",
      scope: "private",
      updatedAt: NOW,
    });
    await insertFailedBatchItem({
      batchId: "resume_retry_unlimited_pool_batch",
      contentHash: "hash-resume-pool-unlimited-retry",
      itemId: "resume_retry_unlimited_pool_batch_item",
      poolItemId,
      target: "resume_pool",
    });

    const result = await claimFailedResumeParseRetry({
      organizationId: ORGANIZATION_ID,
      poolItemId,
      requestedBy: USER_ID,
    });

    expect(result.status).toBe("claimed");
    await expectBatchItemRequeued("resume_retry_unlimited_pool_batch_item");
    const [poolItem] = await db
      .select({ status: resumePoolItem.resumeParseStatus })
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, poolItemId));
    expect(poolItem?.status).toBe("queued");
  });

  it("requeues a failed recruitment record after multiple previous attempts", async () => {
    const resumeRecordId = "resume_retry_unlimited_library_record";
    await createRecruitingRecords(db, {
      candidateName: "招聘台重试候选人",
      createdAt: NOW,
      createdBy: USER_ID,
      id: resumeRecordId,
      interviewQuestions: [],
      organizationId: ORGANIZATION_ID,
      resumeContentHash: "hash-resume-library-unlimited-retry",
      resumeFileName: "resume_library-unlimited-retry.pdf",
      resumeParseError: "解析再次失败",
      resumeParseStatus: "failed",
      resumeStorageKey: "attachments/resume_library/resume_library-unlimited-retry.pdf",
      updatedAt: NOW,
    });
    await insertFailedBatchItem({
      batchId: "resume_retry_unlimited_library_batch",
      contentHash: "hash-resume-library-unlimited-retry",
      itemId: "resume_retry_unlimited_library_batch_item",
      resumeRecordId,
      target: "resume_library",
    });

    const result = await claimFailedResumeParseRetry({
      organizationId: ORGANIZATION_ID,
      requestedBy: USER_ID,
      resumeRecordId,
    });

    expect(result.status).toBe("claimed");
    await expectBatchItemRequeued("resume_retry_unlimited_library_batch_item");
    const [resumeRecord] = await db
      .select({ status: recruitingRecordReadModel.resumeParseStatus })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, resumeRecordId));
    expect(resumeRecord?.status).toBe("queued");
  });
});
