import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewCoreService } from "../../recruiting-records/interviews/interview-core.service.js";
import {
  WorkspaceAccessGuard,
  WORKSPACE_ACCESS_PORT,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { ResumeWorkflowController } from "./resume-workflow.controller.js";
import { ResumeWorkflowService } from "./resume-workflow.service.js";
const detail = {
  candidateName: "候选人",
  createdAt: new Date().toISOString(),
  id: "r1",
  resumeParseStatus: "ready",
  updatedAt: new Date().toISOString(),
};
const workflows = {
  bulkRemove: vi.fn(),
  correctGate: vi.fn(),
  create: vi.fn(),
  duplicates: vi.fn(async () => ({ matches: [] })),
  edit: vi.fn(),
  get: vi.fn(async () => detail),
  history: vi.fn(),
  identity: vi.fn(),
  launch: vi.fn(),
  list: vi.fn(async () => ({ page: 1, pageSize: 20, records: [], total: 0, totalPages: 0 })),
  meetings: vi.fn(),
  patchEvaluation: vi.fn(),
  reassess: vi.fn(),
  remove: vi.fn(),
  rounds: vi.fn(async () => []),
  submitEvaluation: vi.fn(),
  timeline: vi.fn(async () => ({ events: [], summary: {} })),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u1" },
    member: { id: "m1", organizationId: "o1", role: "admin", userId: "u1" },
    workspace: { id: "o1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
@Module({
  controllers: [ResumeWorkflowController],
  providers: [
    WorkspaceAccessGuard,
    { provide: InterviewCoreService, useValue: { visibleCreatorIds: vi.fn(async () => null) } },
    { provide: ResumeWorkflowService, useValue: workflows },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}
describe("workspace resume workflows HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  async function app() {
    const instance = await NestFactory.create(TestModule, { logger: false });
    instance.useGlobalPipes(new StandardSchemaValidationPipe());
    instance.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(instance.get(Reflector)),
    );
    await instance.init();
    close = () => instance.close();
    return instance;
  }
  it("lists and reads resume records", async () => {
    const instance = await app();
    const collectionResponse = await supertest(instance.getHttpServer()).get(
      "/workspaces/test/candidates/resumes",
    );
    expect(collectionResponse.status).toBe(200);
    const detailResponse = await supertest(instance.getHttpServer()).get(
      "/workspaces/test/candidates/resumes/r1",
    );
    expect(detailResponse.status).toBe(200);
  });
  it("validates evaluation and structured gate mutations", async () => {
    const instance = await app();
    const evaluationResponse = await supertest(instance.getHttpServer())
      .patch("/workspaces/test/candidates/resumes/r1/evaluation")
      .send({ status: "invalid" });
    expect(evaluationResponse.status).toBe(400);
    const gateResponse = await supertest(instance.getHttpServer())
      .patch("/workspaces/test/candidates/resumes/r1/structured-evaluation/gates/g1")
      .send({ correctedStatus: "passed" });
    expect(gateResponse.status).toBe(400);
  });
});
