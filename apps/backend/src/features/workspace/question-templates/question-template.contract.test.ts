import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { QuestionTemplateController } from "./question-template.controller.js";
import { QuestionTemplateService } from "./question-template.service.js";

const service = {
  aiGenerateQuestions: vi.fn(async () => ({ questions: [] })),
  archive: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  listAll: vi.fn(),
  refreshEligibleCandidates: vi.fn(async () => ({
    refreshedCount: 1,
    scannedCount: 1,
    success: true,
  })),
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
  controllers: [QuestionTemplateController],
  providers: [
    WorkspaceAccessGuard,
    { provide: QuestionTemplateService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace question templates public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("requires at least one question", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/api/w/test/studio/interview-questions")
      .send({
        description: "",
        jobDescriptionIds: [],
        questions: [],
        scope: "global",
        title: "题库",
      });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("generates and refreshes communication questions", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const generated = await supertest(app.getHttpServer())
      .post("/api/w/test/studio/interview-questions/ai-generate-questions")
      .send({ prompt: "根据候选人经历出题" });
    expect(generated.status).toBe(200);
    expect(service.aiGenerateQuestions).toHaveBeenCalledWith("org-1", {
      prompt: "根据候选人经历出题",
    });
    const refreshed = await supertest(app.getHttpServer()).post(
      "/api/w/test/studio/interview-questions/template-1/refresh-eligible-candidates",
    );
    expect(refreshed.status).toBe(200);
    expect(service.refreshEligibleCandidates).toHaveBeenCalledWith("org-1", "user-1", "template-1");
  });
});
