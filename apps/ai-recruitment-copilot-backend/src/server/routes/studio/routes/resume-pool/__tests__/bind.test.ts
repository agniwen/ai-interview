// POST /:id/bind 集成测试（直接连接真实 PG 数据库，不 mock db/dao）。
// Integration tests for the bind endpoint — hit the real Postgres dev database
// through the actual route + DAO; only the permission middleware is bypassed.

import { testClient } from "hono/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  jobDescription,
  member,
  organization,
  resumePoolItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createResumePoolItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/dao";
import { deleteFixtureResumePoolItems } from "../../../../../../test-utils/db-fixture-cleanup";

const mocks = vi.hoisted(() => ({
  cloneResumeSemanticIndexFromPoolToInterview: vi.fn(async () => {}),
  enqueueResumeReviewGenerationForRecordBestEffort: vi.fn(),
  findSemanticResumeDuplicates: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/clone", () => ({
  cloneResumeSemanticIndexFromPoolToInterview: mocks.cloneResumeSemanticIndexFromPoolToInterview,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service", () => ({
  findSemanticResumeDuplicates: mocks.findSemanticResumeDuplicates,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue",
  () => ({
    enqueueResumeReviewGenerationForRecordBestEffort:
      mocks.enqueueResumeReviewGenerationForRecordBestEffort,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { resumePoolRouter } from "../route";

const ORG_A = "resume_pool_bind_org_a";
const ORG_B = "resume_pool_bind_org_b";
const USER_A = "resume_pool_bind_user_a";
const USER_B = "resume_pool_bind_user_b";
const DEPARTMENT_A = "resume_pool_bind_department_a";
const DEPARTMENT_B = "resume_pool_bind_department_b";
const JD_A = "resume_pool_bind_jd_a";
const JD_A_REPLACEMENT = "resume_pool_bind_jd_a_replacement";
const JD_B = "resume_pool_bind_jd_b";
const NOW = new Date("2026-06-14T09:00:00.000Z");

const PROFILE: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: null,
  name: "候选人甲",
  personalStrengths: [],
  phone: "13800138000",
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 3,
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORG_A } as never);
      c.set("member", { role: "owner" } as never);
      c.set("user", { id: USER_A } as never);
      await next();
    })
    .route("/", resumePoolRouter);
}

const client = testClient(makeApp());

async function seedPoolItem(overrides: { contentHash: string; jobDescriptionId?: string | null }) {
  return await createResumePoolItem({
    candidateEmail: PROFILE.email,
    candidateName: PROFILE.name,
    candidatePhone: PROFILE.phone,
    contentHash: overrides.contentHash,
    createdBy: USER_A,
    jobDescriptionId: overrides.jobDescriptionId ?? null,
    notes: null,
    organizationId: ORG_A,
    resumeFileName: "candidate.pdf",
    resumeProfile: PROFILE,
    resumeText: "候选人甲 OCR 原文",
    scope: "private",
    storageKey: "attachments/resume-pool/bind-test.pdf",
    targetRole: "前端工程师",
  });
}

async function cleanup() {
  await deleteFixtureResumePoolItems({
    organizationIds: [ORG_A, ORG_B],
    userIds: [USER_A, USER_B],
  });
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_A));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_B));
  await db.delete(department).where(eq(department.organizationId, ORG_A));
  await db.delete(department).where(eq(department.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_A));
  await db.delete(member).where(eq(member.userId, USER_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_A));
  await db.delete(user).where(eq(user.id, USER_B));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "resume-pool-bind-a@example.com",
      emailVerified: false,
      id: USER_A,
      name: "resume-pool-bind-a",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "resume-pool-bind-b@example.com",
      emailVerified: false,
      id: USER_B,
      name: "resume-pool-bind-b",
      updatedAt: NOW,
    },
  ]);
  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Resume Pool Bind Org A", slug: "resume-pool-bind-org-a" },
    { createdAt: NOW, id: ORG_B, name: "Resume Pool Bind Org B", slug: "resume-pool-bind-org-b" },
  ]);
  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "resume_pool_bind_member_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_A,
    },
    {
      createdAt: NOW,
      id: "resume_pool_bind_member_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_B,
    },
  ]);
  await db.insert(department).values([
    {
      createdAt: NOW,
      createdBy: USER_A,
      id: DEPARTMENT_A,
      name: "Resume Pool Bind Department A",
      organizationId: ORG_A,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_B,
      id: DEPARTMENT_B,
      name: "Resume Pool Bind Department B",
      organizationId: ORG_B,
      updatedAt: NOW,
    },
  ]);
  await db.insert(jobDescription).values([
    {
      createdAt: NOW,
      createdBy: USER_A,
      departmentId: DEPARTMENT_A,
      evaluationMode: "legacy",
      id: JD_A,
      lifecycleStatus: "published",
      name: "前端工程师",
      organizationId: ORG_A,
      prompt: "负责前端开发。",
      publishedAt: NOW,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_B,
      departmentId: DEPARTMENT_B,
      evaluationMode: "legacy",
      id: JD_B,
      lifecycleStatus: "published",
      name: "后端工程师",
      organizationId: ORG_B,
      prompt: "负责后端开发。",
      publishedAt: NOW,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USER_A,
      departmentId: DEPARTMENT_A,
      evaluationMode: "legacy",
      id: JD_A_REPLACEMENT,
      lifecycleStatus: "published",
      name: "资深前端工程师",
      organizationId: ORG_A,
      prompt: "负责资深前端开发。",
      publishedAt: NOW,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

describe("POST /:id/bind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when the job description does not exist", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-bind-nonexistent-jd" });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: "does-not-exist" },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "所选在招岗位不存在。" });
  });

  it("returns 400 when the job description belongs to another organization", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-bind-cross-org-jd" });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_B },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "所选在招岗位不存在。" });
  });

  it("binds an unbound pool item to a job description in the same organization", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-bind-success" });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toBeNull();
    expect(
      (body as { jobDescriptionId: string | null; jobDescriptionName: string | null })
        ?.jobDescriptionId,
    ).toBe(JD_A);
    // 详情 DTO 现在带出关联岗位名，供简历详情页「关联岗位」字段展示。
    expect(
      (body as { jobDescriptionId: string | null; jobDescriptionName: string | null })
        ?.jobDescriptionName,
    ).toBe("前端工程师");

    const [row] = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, poolItemId));
    expect(row?.jobDescriptionId).toBe(JD_A);
  });

  it("returns 404 when the pool item does not exist", async () => {
    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A },
      param: { id: "does-not-exist" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "记录不存在。" });
  });

  it("returns 409 when the pool item is already bound (bind-once)", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-bind-already-bound",
      jobDescriptionId: JD_A,
    });

    const response = await client[":id"].bind.$post({
      json: { jobDescriptionId: JD_A },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "该简历已绑定岗位。" });

    const [row] = await db.select().from(resumePoolItem).where(eq(resumePoolItem.id, poolItemId));
    expect(row?.jobDescriptionId).toBe(JD_A);
  });
});

describe("POST /:id/import job association", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueResumeReviewGenerationForRecordBestEffort.mockResolvedValue({
      runId: "resume-pool-import-review-run",
      status: "enqueued",
    });
    mocks.findSemanticResumeDuplicates.mockResolvedValue([]);
  });

  it("exposes the selected job on the pool item after import", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-import-bind-success" });

    const response = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionId: JD_A,
        jobDescriptionMode: "bind",
      },
      param: { id: poolItemId },
    });

    expect(response.status).toBe(201);

    const detailResponse = await client[":id"].$get({ param: { id: poolItemId } });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      jobDescriptionId: JD_A,
      jobDescriptionName: "前端工程师",
    });
  });

  it("replaces the pool item job when explicitly reimported for another job", async () => {
    const poolItemId = await seedPoolItem({ contentHash: "hash-reimport-replace-job" });

    const firstResponse = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionId: JD_A,
        jobDescriptionMode: "bind",
      },
      param: { id: poolItemId },
    });
    expect(firstResponse.status).toBe(201);

    const secondResponse = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionId: JD_A_REPLACEMENT,
        jobDescriptionMode: "bind",
        reimport: true,
      },
      param: { id: poolItemId },
    });
    expect(secondResponse.status).toBe(201);

    const detailResponse = await client[":id"].$get({ param: { id: poolItemId } });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      jobDescriptionId: JD_A_REPLACEMENT,
      jobDescriptionName: "资深前端工程师",
    });
  });

  it("keeps the existing pool item job when imported without selecting a job", async () => {
    const poolItemId = await seedPoolItem({
      contentHash: "hash-import-without-job",
      jobDescriptionId: JD_A,
    });

    const response = await client[":id"].import.$post({
      json: {
        dedupPolicy: "force",
        jobDescriptionMode: "none",
      },
      param: { id: poolItemId },
    });
    expect(response.status).toBe(201);

    const detailResponse = await client[":id"].$get({ param: { id: poolItemId } });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      jobDescriptionId: JD_A,
      jobDescriptionName: "前端工程师",
    });
  });
});
