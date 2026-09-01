import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { Readable } from "node:stream";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterviewCoreController } from "../../recruiting-records/interviews/interview-core.controller.js";
import { InterviewCoreService } from "../../recruiting-records/interviews/interview-core.service.js";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { ResumeCoreController } from "./resume-core.controller.js";
import { ResumeCoreService } from "./resume-core.service.js";

const resumeService = {
  findDuplicates: vi.fn(async () => ({ matches: [{ id: "candidate-2", score: 0.92 }] })),
  getReviewResume: vi.fn(async () => ({
    body: Readable.from([Buffer.from("resume")]),
    contentLength: 6,
    contentType: "application/pdf",
    filename: "candidate.pdf",
  })),
  listSkillSuggestions: vi.fn(),
};
const workspaceAccess = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: {
      id: "member-1",
      organizationId: "organization-1",
      role: "member",
      userId: "user-1",
    },
    workspace: {
      id: "organization-1",
      logo: null,
      metadata: null,
      name: "测试工作区",
      slug: "test",
    },
  })),
};
const interviewService = { summary: vi.fn() };

@Module({
  controllers: [InterviewCoreController, ResumeCoreController],
  providers: [
    WorkspaceAccessGuard,
    { provide: InterviewCoreService, useValue: interviewService },
    { provide: ResumeCoreService, useValue: resumeService },
    { provide: WORKSPACE_ACCESS_PORT, useValue: workspaceAccess },
  ],
})
class ResumeCoreContractTestModule {}

describe("workspace interview and resume public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  async function start() {
    const app = await NestFactory.create(ResumeCoreContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();
    return supertest(app.getHttpServer());
  }

  it("validates and serializes the interview dedup endpoint", async () => {
    const http = await start();
    const invalid = await http
      .post("/workspaces/test/candidates/recruiting-records/dedup-check")
      .send({ phone: "x".repeat(41) });
    expect(invalid.status).toBe(400);

    const response = await http
      .post("/workspaces/test/candidates/recruiting-records/dedup-check")
      .send({ name: "候选人" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matches: [{ id: "candidate-2", score: 0.92 }] });
  });

  it("preserves binary response headers and bytes", async () => {
    const http = await start();
    const response = await http.get(
      "/workspaces/test/candidates/resumes/candidate-1/review/resume",
    );
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("candidate.pdf");
    expect(response.body).toEqual(Buffer.from("resume"));
  });
});
