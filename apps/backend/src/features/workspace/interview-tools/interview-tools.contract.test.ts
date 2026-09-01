import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { InterviewToolsController } from "./interview-tools.controller.js";
import { InterviewToolsService } from "./interview-tools.service.js";

const service = {
  generateQuestions: vi.fn(),
  generateReview: vi.fn(),
  matchJobDescription: vi.fn(),
  parseResume: vi.fn(),
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
  controllers: [InterviewToolsController],
  providers: [
    WorkspaceAccessGuard,
    { provide: InterviewToolsService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class InterviewToolsContractTestModule {}

describe("workspace interview AI tools HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  async function app() {
    const application = await NestFactory.create(InterviewToolsContractTestModule, {
      logger: false,
    });
    application.useGlobalPipes(new StandardSchemaValidationPipe());
    await application.init();
    close = () => application.close();
    return application;
  }

  it("validates resume profile before starting a generation stream", async () => {
    const application = await app();
    const response = await supertest(application.getHttpServer())
      .post("/api/w/test/interview/generate-questions")
      .send({ resumeProfile: { name: "候选人" } });
    expect(response.status).toBe(400);
    expect(service.generateQuestions).not.toHaveBeenCalled();
  });

  it("returns the best-effort job match contract", async () => {
    service.matchJobDescription.mockResolvedValueOnce({ matchedId: "job-1", reason: "技能匹配" });
    const application = await app();
    const response = await supertest(application.getHttpServer())
      .post("/api/w/test/interview/match-job-description")
      .send({
        resumeProfile: {
          age: null,
          educationExperiences: [],
          email: null,
          gender: null,
          name: "候选人",
          personalStrengths: [],
          phone: null,
          projectExperiences: [],
          schools: [],
          skills: [],
          targetRoles: [],
          workExperiences: [],
          workYears: null,
        },
      });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matchedId: "job-1", reason: "技能匹配" });
  });
});
