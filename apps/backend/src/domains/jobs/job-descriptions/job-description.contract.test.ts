import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceAccessGuard,
  WORKSPACE_ACCESS_PORT,
} from "../../../infrastructure/http/workspace-access/index.js";
import { JobDescriptionController } from "./job-description.controller.js";
import { JobDescriptionService } from "./job-description.service.js";

const service = {
  aiGenerate: vi.fn(async () => ({
    jobDescription: "职责",
    suggestedName: "工程师",
    supplementedItems: [],
  })),
  create: vi.fn(),
  generateCode: vi.fn(async () => ({ code: "AUR0001" })),
  generateScreeningPolicy: vi.fn(async () => ({
    policy: { enabled: false, rules: [], version: 1 },
  })),
  get: vi.fn(),
  list: vi.fn(),
  listAll: vi.fn(),
  listRecruiting: vi.fn(),
  operational: vi.fn(),
  recommendations: vi.fn(async () => ({
    candidates: [],
    diagnostics: { vectorHitCount: 0 },
    jobDescription: { id: "job-1", name: "工程师" },
    status: "disabled",
  })),
  referralLink: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
};

const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "admin", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [JobDescriptionController],
  providers: [
    WorkspaceAccessGuard,
    { provide: JobDescriptionService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class JobDescriptionContractTestModule {}

describe("workspace job descriptions public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  async function app() {
    const instance = await NestFactory.create(JobDescriptionContractTestModule, { logger: false });
    instance.useGlobalPipes(new StandardSchemaValidationPipe());
    instance.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(instance.get(Reflector)),
    );
    await instance.init();
    close = () => instance.close();
    return instance;
  }

  it("rejects a create request without an interviewer", async () => {
    const instance = await app();
    const response = await supertest(instance.getHttpServer()).post("/workspaces/test/jobs").send({
      allowCrossDepartmentInterviewers: false,
      departmentId: "department-1",
      interviewerIds: [],
      name: "后端工程师",
      prompt: "负责服务端系统设计与交付",
    });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("exposes the generated code through the read permission boundary", async () => {
    const instance = await app();
    const response = await supertest(instance.getHttpServer())
      .post("/workspaces/test/jobs/generate-code")
      .send();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ code: "AUR0001" });
    expect(service.generateCode).toHaveBeenCalledWith("org-1");
  });

  it("exposes AI drafting and screening policy generation through the update permission boundary", async () => {
    const instance = await app();
    const drafted = await supertest(instance.getHttpServer())
      .post("/workspaces/test/jobs/ai-generate")
      .send({ prompt: "负责后端系统开发" });
    expect(drafted.status).toBe(200);
    expect(service.aiGenerate).toHaveBeenCalledWith({ prompt: "负责后端系统开发" });

    const screening = await supertest(instance.getHttpServer())
      .post("/workspaces/test/jobs/generate-screening-policy")
      .send({ prompt: "本科，三年以上 TypeScript 经验" });
    expect(screening.status).toBe(200);
    expect(service.generateScreeningPolicy).toHaveBeenCalledWith({
      prompt: "本科，三年以上 TypeScript 经验",
    });
  });

  it("uses both JD and resume-library read permissions for candidate recommendations", async () => {
    const instance = await app();
    const response = await supertest(instance.getHttpServer())
      .post("/workspaces/test/jobs/job-1/recommendations")
      .send({ excludeAlreadyLinked: false, limit: 5 });
    expect(response.status).toBe(200);
    expect(service.recommendations).toHaveBeenCalledWith("org-1", "job-1", {
      excludeAlreadyLinked: false,
      limit: 5,
    });
    expect(access.authorize).toHaveBeenCalledTimes(2);
  });
});
