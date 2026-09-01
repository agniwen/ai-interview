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
import { CandidateFormController } from "./candidate-form.controller.js";
import { CandidateFormService } from "./candidate-form.service.js";

const service = {
  aiGenerateQuestions: vi.fn(async () => ({ questions: [] })),
  archive: vi.fn(),
  candidateSearch: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  listAll: vi.fn(),
  refreshEligibleCandidates: vi.fn(async () => ({
    refreshedCount: 2,
    scannedCount: 3,
    success: true,
  })),
  submissions: vi.fn(),
  unarchive: vi.fn(),
  update: vi.fn(),
  version: vi.fn(),
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
  controllers: [CandidateFormController],
  providers: [
    WorkspaceAccessGuard,
    { provide: CandidateFormService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class CandidateFormContractTestModule {}

describe("workspace candidate forms public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("rejects a form without questions", async () => {
    const app = await NestFactory.create(CandidateFormContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer())
      .post("/workspaces/test/setup/candidate-forms")
      .send({
        description: "",
        jobDescriptionIds: [],
        questions: [],
        scope: "global",
        title: "表单",
      });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("rejects invalid submission pagination", async () => {
    const app = await NestFactory.create(CandidateFormContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer()).get(
      "/workspaces/test/setup/candidate-forms/form-1/submissions?limit=1000",
    );
    expect(response.status).toBe(400);
    expect(service.submissions).not.toHaveBeenCalled();
  });

  it("generates questions and refreshes eligible candidates through update permission", async () => {
    const app = await NestFactory.create(CandidateFormContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const generated = await supertest(app.getHttpServer())
      .post("/workspaces/test/setup/candidate-forms/ai-generate-questions")
      .send({ prompt: "根据岗位生成三道表单题" });
    expect(generated.status).toBe(200);
    expect(service.aiGenerateQuestions).toHaveBeenCalledWith("org-1", {
      prompt: "根据岗位生成三道表单题",
    });

    const refreshed = await supertest(app.getHttpServer()).post(
      "/workspaces/test/setup/candidate-forms/form-1/refresh-eligible-candidates",
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toEqual({ refreshedCount: 2, scannedCount: 3, success: true });
    expect(service.refreshEligibleCandidates).toHaveBeenCalledWith("org-1", "user-1", "form-1");
  });
});
