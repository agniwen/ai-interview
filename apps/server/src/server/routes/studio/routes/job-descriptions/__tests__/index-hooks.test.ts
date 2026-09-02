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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@server/lib/server/db/index";
import {
  department,
  interviewer,
  jobDescription,
  member,
  organization,
  user,
} from "@app/db-schema/schema";
import { factory } from "../../../../../factory";
import { requirePermission as defaultRequirePermission } from "../../../../../middlewares/permission";
import { generateStructuredJobBlueprintPreview } from "../application/default-job-evaluation-lifecycle";
import { createJobEvaluationPreviewStreamRouter } from "../routes/evaluation-blueprint-preview/route";

import { createJobDescriptionsRouter } from "../route";
import type { JobDescriptionsRouterDependencies } from "../route";

const ORG_ID = "index_hooks_org";
const USER_ID = "index_hooks_user";
const MEMBER_ID = "index_hooks_member";
const DEPARTMENT_ID = "index_hooks_department";
const INTERVIEWER_ID = "index_hooks_interviewer";
const EXISTING_JD_ID = "index_hooks_existing_jd";
const NOW = new Date("2026-06-01T00:00:00.000Z");

const deleteHookCalls: { jobDescriptionId: string; organizationId: string }[] = [];
const enqueueHookCalls: { jobDescriptionId: string | null | undefined; organizationId: string }[] =
  [];
const hookCalls = { delete: deleteHookCalls, enqueue: enqueueHookCalls };

const routerDependencies: JobDescriptionsRouterDependencies = {
  deleteJobDescriptionSemanticIndexBestEffort: (options) => {
    hookCalls.delete.push(options);
    return Promise.resolve();
  },
  enqueueJobDescriptionIndexJobBestEffort: (options) => {
    hookCalls.enqueue.push(options);
    return Promise.resolve();
  },
  generateStructuredJobBlueprintPreview,
  jobEvaluationPreviewStreamRouter: createJobEvaluationPreviewStreamRouter(),
  loadJobDescriptionMetrics: () =>
    Promise.resolve({ candidatesByJd: [], completionByJd: [], loadByInterviewer: [] }),
  requirePermission: (resource, action) =>
    defaultRequirePermission(resource, action, {
      createRequestWorkspaceAuthorizer: () => () => Promise.resolve(true),
    }),
};

const jobDescriptionsRouter = createJobDescriptionsRouter(routerDependencies);

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      const [activeOrg] = await db
        .select()
        .from(organization)
        .where(eq(organization.id, ORG_ID))
        .limit(1);
      const [userRecord] = await db.select().from(user).where(eq(user.id, USER_ID)).limit(1);
      const [memberRecord] = await db
        .select()
        .from(member)
        .where(eq(member.id, MEMBER_ID))
        .limit(1);
      if (!activeOrg || !userRecord || !memberRecord) {
        throw new Error("test workspace fixtures are missing");
      }
      c.set("activeOrg", activeOrg);
      c.set("member", memberRecord);
      c.set("user", userRecord);
      await next();
    })
    .route("/job-descriptions", jobDescriptionsRouter);
}

const client = testClient(makeApp());

async function cleanup() {
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_ID));
  await db.delete(interviewer).where(eq(interviewer.organizationId, ORG_ID));
  await db.delete(department).where(eq(department.organizationId, ORG_ID));
  await db.delete(member).where(eq(member.id, MEMBER_ID));
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
  await db.insert(member).values({
    createdAt: NOW,
    id: MEMBER_ID,
    organizationId: ORG_ID,
    role: "owner",
    userId: USER_ID,
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

interface JobDescriptionTestOverrides {
  allowCrossDepartmentInterviewers?: boolean;
  departmentId?: string;
  interviewerIds?: string[];
  name?: string;
  prompt?: string;
}

function jobDescriptionPayload(overrides?: JobDescriptionTestOverrides) {
  return {
    allowCrossDepartmentInterviewers: true,
    departmentId: DEPARTMENT_ID,
    interviewerIds: [INTERVIEWER_ID],
    name: "前端工程师",
    prompt: "负责前端工程化与业务开发。",
    ...overrides,
  };
}

beforeEach(async () => {
  await cleanup();
  await seedFixtures();
  hookCalls.delete.length = 0;
  hookCalls.enqueue.length = 0;
});

afterEach(cleanup);

describe("job-descriptions route index hooks", () => {
  it("POST / publishes a qualitative job and indexes it", async () => {
    const res = await client["job-descriptions"].$post({ json: jobDescriptionPayload() });
    expect(res.status).toBe(201);
    const body = await res.json();
    if (!("id" in body)) {
      throw new Error("expected the created job description record in the response body");
    }

    expect(body).toMatchObject({
      evaluationMode: "qualitative",
      lifecycleStatus: "published",
    });
    expect(hookCalls.enqueue).toEqual([{ jobDescriptionId: body.id, organizationId: ORG_ID }]);
  });

  it("POST / rejects retired recruiter evaluation settings", async () => {
    const res = await client["job-descriptions"].$post({
      // SAFETY: This test intentionally sends a retired field outside the typed API contract.
      json: {
        ...jobDescriptionPayload(),
        structuredConfig: { priorityConditions: [] },
      } as never,
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /:id saves and indexes the qualitative JD", async () => {
    await db.insert(jobDescription).values({
      allowCrossDepartmentInterviewers: true,
      createdAt: NOW,
      createdBy: USER_ID,
      departmentId: DEPARTMENT_ID,
      id: EXISTING_JD_ID,
      name: "后端工程师",
      organizationId: ORG_ID,
      prompt: "负责后端服务开发。",
      updatedAt: NOW,
    });

    const res = await client["job-descriptions"][":id"].$patch({
      json: jobDescriptionPayload({ name: "后端工程师（已更新）" }),
      param: { id: EXISTING_JD_ID },
    });
    expect(res.status).toBe(200);

    expect(hookCalls.enqueue).toEqual([
      { jobDescriptionId: EXISTING_JD_ID, organizationId: ORG_ID },
    ]);
  });

  it("PATCH /:id/operational delegates department changes to semantic indexing", async () => {
    await db.insert(jobDescription).values({
      allowCrossDepartmentInterviewers: true,
      createdAt: NOW,
      createdBy: USER_ID,
      departmentId: DEPARTMENT_ID,
      id: EXISTING_JD_ID,
      name: "后端工程师",
      organizationId: ORG_ID,
      prompt: "负责后端服务开发。",
      updatedAt: NOW,
    });

    const res = await client["job-descriptions"][":id"].operational.$patch({
      json: {
        allowCrossDepartmentInterviewers: true,
        departmentId: DEPARTMENT_ID,
        interviewerIds: [INTERVIEWER_ID],
      },
      param: { id: EXISTING_JD_ID },
    });
    expect(res.status).toBe(200);
    expect(hookCalls.enqueue).toEqual([
      { jobDescriptionId: EXISTING_JD_ID, organizationId: ORG_ID },
    ]);
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
      updatedAt: NOW,
    });

    const res = await client["job-descriptions"][":id"].$delete({ param: { id: EXISTING_JD_ID } });
    expect(res.status).toBe(200);

    expect(hookCalls.delete).toHaveLength(1);
    expect(hookCalls.delete[0]).toEqual({
      jobDescriptionId: EXISTING_JD_ID,
      organizationId: ORG_ID,
    });
  });
});
