// 中文：验证 JD 建/改/删路由钩子确实调用了语义索引 best-effort 帮助函数
// （id/org 参数正确）。钩子内部吞错、永不抛，因此这里只断言"被调用"，不测试
// "钩子抛错时 CRUD 仍成功"——那是不可达场景，由 A6 的吞错测试覆盖。
// English: Assert the JD create/update/delete route hooks actually invoke the
// semantic-index best-effort helpers with the correct id/org. The helpers
// swallow internally and never throw, so we only assert "was called" here —
// "hook throws but CRUD still succeeds" is unreachable and is covered by A6's
// own swallow tests.

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { department, interviewer, jobDescription, organization, user } from "@arc/db-schema/schema";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { createDefaultResumeScreeningPolicy } from "@arc/shared/resume-screening";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  deleteJobDescriptionSemanticIndexBestEffort: vi.fn(),
  enqueueJobDescriptionIndexJobBestEffort: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/jd-semantic/enqueue", () => ({
  deleteJobDescriptionSemanticIndexBestEffort: mocks.deleteJobDescriptionSemanticIndexBestEffort,
  enqueueJobDescriptionIndexJobBestEffort: mocks.enqueueJobDescriptionIndexJobBestEffort,
}));

// requirePermission 依赖真实 workspace request context（headers/session/DB）
// 才能解析，测试里绕开鉴权，改由外层 middleware 直接注入 activeOrg/user。
// requirePermission needs a real workspace request context (headers/session/
// DB) to resolve; bypass it in tests and inject activeOrg/user directly via
// an outer middleware instead.
vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { jobDescriptionsRouter } from "../route";

const ORG_ID = "index_hooks_org";
const USER_ID = "index_hooks_user";
const DEPARTMENT_ID = "index_hooks_department";
const INTERVIEWER_ID = "index_hooks_interviewer";
const EXISTING_JD_ID = "index_hooks_existing_jd";
const NOW = new Date("2026-06-01T00:00:00.000Z");

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORG_ID } as never);
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/job-descriptions", jobDescriptionsRouter);
}

const client = testClient(makeApp());

async function cleanup() {
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_ID));
  await db.delete(interviewer).where(eq(interviewer.organizationId, ORG_ID));
  await db.delete(department).where(eq(department.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

async function seedFixtures() {
  await db.insert(user).values({
    createdAt: NOW,
    email: "index-hooks@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "李四",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "钩子测试公司",
    slug: "index-hooks-org",
  });
  await db.insert(department).values({
    createdAt: NOW,
    createdBy: USER_ID,
    id: DEPARTMENT_ID,
    name: "研发部",
    organizationId: ORG_ID,
    updatedAt: NOW,
  });
  await db.insert(interviewer).values({
    createdAt: NOW,
    createdBy: USER_ID,
    departmentId: DEPARTMENT_ID,
    id: INTERVIEWER_ID,
    name: "面试官甲",
    organizationId: ORG_ID,
    prompt: "请评估候选人的技术能力。",
    updatedAt: NOW,
    voice: "voice_agent_Male_Phone_1",
  });
}

function jobDescriptionPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    allowCrossDepartmentInterviewers: true,
    departmentId: DEPARTMENT_ID,
    description: "",
    interviewerIds: [INTERVIEWER_ID],
    name: "前端工程师",
    prompt: "负责前端工程化与业务开发。",
    resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
    ...overrides,
  };
}

beforeEach(async () => {
  await cleanup();
  await seedFixtures();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("job-descriptions route index hooks", () => {
  it("POST / enqueues a JD index job with the new record id and active org", async () => {
    const res = await client["job-descriptions"].$post({ json: jobDescriptionPayload() });
    expect(res.status).toBe(201);
    const body = await res.json();
    if (!("id" in body)) {
      throw new Error("expected the created job description record in the response body");
    }

    expect(mocks.enqueueJobDescriptionIndexJobBestEffort).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueJobDescriptionIndexJobBestEffort).toHaveBeenCalledWith({
      jobDescriptionId: body.id,
      organizationId: ORG_ID,
    });
  });

  it("POST / persists and returns the structured JD configuration", async () => {
    const config = {
      ...createDefaultJobDescriptionStructuredConfig(),
      hardGates: {
        ...createDefaultJobDescriptionStructuredConfig().hardGates,
        education: "本科及以上，985/211 优先",
      },
      priorityConditions: [
        {
          condition: "具有头部企业项目经验",
          id: "priority-1",
          points: 5,
        },
      ],
    };

    const res = await client["job-descriptions"].$post({
      json: jobDescriptionPayload({ structuredConfig: config }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();

    expect("structuredConfig" in body ? body.structuredConfig : null).toEqual(config);
  });

  it("PATCH /:id enqueues a JD index job with the updated record id and active org", async () => {
    await db.insert(jobDescription).values({
      allowCrossDepartmentInterviewers: true,
      createdAt: NOW,
      createdBy: USER_ID,
      departmentId: DEPARTMENT_ID,
      id: EXISTING_JD_ID,
      name: "后端工程师",
      organizationId: ORG_ID,
      prompt: "负责后端服务开发。",
      resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
      resumeScreeningPolicyVersion: 1,
      updatedAt: NOW,
    });

    const res = await client["job-descriptions"][":id"].$patch({
      json: jobDescriptionPayload({ name: "后端工程师（已更新）" }),
      param: { id: EXISTING_JD_ID },
    });
    expect(res.status).toBe(200);

    expect(mocks.enqueueJobDescriptionIndexJobBestEffort).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueJobDescriptionIndexJobBestEffort).toHaveBeenCalledWith({
      jobDescriptionId: EXISTING_JD_ID,
      organizationId: ORG_ID,
    });
  });

  it("DELETE /:id purges the JD semantic index", async () => {
    await db.insert(jobDescription).values({
      allowCrossDepartmentInterviewers: true,
      createdAt: NOW,
      createdBy: USER_ID,
      departmentId: DEPARTMENT_ID,
      id: EXISTING_JD_ID,
      name: "测试工程师",
      organizationId: ORG_ID,
      prompt: "负责质量保障。",
      resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
      resumeScreeningPolicyVersion: 1,
      updatedAt: NOW,
    });

    const res = await client["job-descriptions"][":id"].$delete({ param: { id: EXISTING_JD_ID } });
    expect(res.status).toBe(200);

    expect(mocks.deleteJobDescriptionSemanticIndexBestEffort).toHaveBeenCalledTimes(1);
    expect(mocks.deleteJobDescriptionSemanticIndexBestEffort).toHaveBeenCalledWith({
      jobDescriptionId: EXISTING_JD_ID,
      organizationId: ORG_ID,
    });
  });
});
