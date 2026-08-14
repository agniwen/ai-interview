import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  jobDescription,
  organization,
  resumePoolItem,
  resumePoolImport,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { loadResumePoolItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { repairResumePoolJobAssociations } from "./repair-resume-pool-job-associations";

const ORG_ID = "resume_pool_job_repair_org";
const USER_ID = "resume_pool_job_repair_user";
const DEPARTMENT_ID = "resume_pool_job_repair_department";
const OLD_JOB_ID = "resume_pool_job_repair_old_job";
const NEW_JOB_ID = "resume_pool_job_repair_new_job";
const TARGET_POOL_ID = "resume_pool_job_repair_target";
const BOUND_POOL_ID = "resume_pool_job_repair_bound";
const NOW = new Date("2026-08-05T09:00:00.000Z");

async function cleanup(): Promise<void> {
  await db.delete(resumePoolItem).where(eq(resumePoolItem.organizationId, ORG_ID));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_ID));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_ID));
  await db.delete(department).where(eq(department.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "resume-pool-job-repair@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "resume-pool-job-repair",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "Resume Pool Job Repair Org",
    slug: "resume-pool-job-repair-org",
  });
  await db.insert(department).values({
    createdAt: NOW,
    createdBy: USER_ID,
    id: DEPARTMENT_ID,
    name: "研发部",
    organizationId: ORG_ID,
    updatedAt: NOW,
  });
  await db.insert(jobDescription).values([
    {
      createdAt: NOW,
      createdBy: USER_ID,
      departmentId: DEPARTMENT_ID,
      evaluationMode: "legacy",
      id: OLD_JOB_ID,
      lifecycleStatus: "published",
      name: "旧岗位",
      organizationId: ORG_ID,
      prompt: "旧岗位描述",
      publishedAt: NOW,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_ID,
      departmentId: DEPARTMENT_ID,
      evaluationMode: "legacy",
      id: NEW_JOB_ID,
      lifecycleStatus: "published",
      name: "新岗位",
      organizationId: ORG_ID,
      prompt: "新岗位描述",
      publishedAt: NOW,
      updatedAt: NOW,
    },
  ]);
  await db.insert(resumePoolItem).values([
    {
      candidateName: "待回填候选人",
      createdAt: NOW,
      createdBy: USER_ID,
      id: TARGET_POOL_ID,
      jobDescriptionId: null,
      organizationId: ORG_ID,
      scope: "public",
      updatedAt: NOW,
    },
    {
      candidateName: "已有岗位候选人",
      createdAt: NOW,
      createdBy: USER_ID,
      id: BOUND_POOL_ID,
      jobDescriptionId: OLD_JOB_ID,
      organizationId: ORG_ID,
      scope: "public",
      updatedAt: NOW,
    },
  ]);
  await db.insert(studioInterview).values([
    {
      candidateName: "待回填候选人-旧岗位",
      createdAt: new Date("2026-08-01T09:00:00.000Z"),
      id: "resume_pool_job_repair_record_old",
      jobDescriptionId: OLD_JOB_ID,
      organizationId: ORG_ID,
      updatedAt: NOW,
    },
    {
      candidateName: "待回填候选人-新岗位",
      createdAt: new Date("2026-08-02T09:00:00.000Z"),
      id: "resume_pool_job_repair_record_new",
      jobDescriptionId: NEW_JOB_ID,
      organizationId: ORG_ID,
      updatedAt: NOW,
    },
    {
      candidateName: "待回填候选人-未选岗位",
      createdAt: new Date("2026-08-03T09:00:00.000Z"),
      id: "resume_pool_job_repair_record_none",
      jobDescriptionId: null,
      organizationId: ORG_ID,
      updatedAt: NOW,
    },
    {
      candidateName: "已有岗位候选人-新岗位",
      createdAt: new Date("2026-08-04T09:00:00.000Z"),
      id: "resume_pool_job_repair_record_bound",
      jobDescriptionId: NEW_JOB_ID,
      organizationId: ORG_ID,
      updatedAt: NOW,
    },
  ]);
  await db.insert(resumePoolImport).values([
    {
      id: "resume_pool_job_repair_import_old",
      importedAt: new Date("2026-08-01T09:00:00.000Z"),
      importedBy: USER_ID,
      importedResumeRecordId: "resume_pool_job_repair_record_old",
      organizationId: ORG_ID,
      poolItemId: TARGET_POOL_ID,
    },
    {
      id: "resume_pool_job_repair_import_new",
      importedAt: new Date("2026-08-02T09:00:00.000Z"),
      importedBy: USER_ID,
      importedResumeRecordId: "resume_pool_job_repair_record_new",
      organizationId: ORG_ID,
      poolItemId: TARGET_POOL_ID,
    },
    {
      id: "resume_pool_job_repair_import_none",
      importedAt: new Date("2026-08-03T09:00:00.000Z"),
      importedBy: USER_ID,
      importedResumeRecordId: "resume_pool_job_repair_record_none",
      organizationId: ORG_ID,
      poolItemId: TARGET_POOL_ID,
    },
    {
      id: "resume_pool_job_repair_import_bound",
      importedAt: new Date("2026-08-04T09:00:00.000Z"),
      importedBy: USER_ID,
      importedResumeRecordId: "resume_pool_job_repair_record_bound",
      organizationId: ORG_ID,
      poolItemId: BOUND_POOL_ID,
    },
  ]);
});

afterAll(cleanup);

describe("resume pool job association repair", () => {
  it("backfills only empty associations from the latest non-empty imported job", async () => {
    const preview = await repairResumePoolJobAssociations({
      apply: false,
      db,
      organizationId: ORG_ID,
    });
    expect(preview).toMatchObject({ candidateCount: 1, updatedCount: 0 });
    expect(preview.candidates).toEqual([
      expect.objectContaining({ jobDescriptionId: NEW_JOB_ID, poolItemId: TARGET_POOL_ID }),
    ]);

    const applied = await repairResumePoolJobAssociations({
      apply: true,
      db,
      organizationId: ORG_ID,
    });
    expect(applied).toMatchObject({ candidateCount: 1, updatedCount: 1 });

    const repaired = await loadResumePoolItem({
      organizationId: ORG_ID,
      poolItemId: TARGET_POOL_ID,
      userId: USER_ID,
    });
    const preserved = await loadResumePoolItem({
      organizationId: ORG_ID,
      poolItemId: BOUND_POOL_ID,
      userId: USER_ID,
    });
    expect(repaired).toMatchObject({
      jobDescriptionId: NEW_JOB_ID,
      jobDescriptionName: "新岗位",
    });
    expect(preserved).toMatchObject({
      jobDescriptionId: OLD_JOB_ID,
      jobDescriptionName: "旧岗位",
    });

    const repeatedPreview = await repairResumePoolJobAssociations({
      apply: false,
      db,
      organizationId: ORG_ID,
    });
    expect(repeatedPreview).toMatchObject({ candidateCount: 0, updatedCount: 0 });
  });
});
