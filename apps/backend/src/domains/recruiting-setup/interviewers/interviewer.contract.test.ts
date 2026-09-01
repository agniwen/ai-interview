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
import { InterviewerController } from "./interviewer.controller.js";
import { InterviewerService } from "./interviewer.service.js";
import { PublicInterviewerVoicePreviewController } from "./public-interviewer-voice-preview.controller.js";

const interviewer = {
  createdAt: "2026-09-01T00:00:00.000Z",
  createdBy: "user-1",
  departmentId: "department-1",
  description: null,
  id: "interviewer-1",
  name: "技术面试官",
  prompt: "请进行技术面试",
  updatedAt: "2026-09-01T00:00:00.000Z",
  voice: "Chinese (Mandarin)_Reliable_Executive",
};

const interviewerService = {
  create: vi.fn(async () => interviewer),
  get: vi.fn(async () => interviewer),
  list: vi.fn(),
  listAll: vi.fn(),
  publicVoicePreview: vi.fn(async () => ({
    body: new Uint8Array([1, 2, 3]),
    headers: { "Content-Type": "audio/mpeg" },
  })),
  remove: vi.fn(),
  update: vi.fn(),
  voicePreview: vi.fn(),
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

@Module({
  controllers: [InterviewerController, PublicInterviewerVoicePreviewController],
  providers: [
    WorkspaceAccessGuard,
    { provide: InterviewerService, useValue: interviewerService },
    { provide: WORKSPACE_ACCESS_PORT, useValue: workspaceAccess },
  ],
})
class InterviewerContractTestModule {}

describe("workspace interviewers public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("serves public voice previews from the recruiting setup boundary", async () => {
    const app = await NestFactory.create(InterviewerContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer()).get(
      "/public/minimax-voice-previews/vp-1",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/mpeg");
    expect(interviewerService.publicVoicePreview).toHaveBeenCalledWith("vp-1");
  });

  it("validates create input before calling the service", async () => {
    const app = await NestFactory.create(InterviewerContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer())
      .post("/workspaces/test/setup/interviewers")
      .send({ departmentId: "", name: "", prompt: "", voice: "bad" });

    expect(response.status).toBe(400);
    expect(interviewerService.create).not.toHaveBeenCalled();
  });

  it("creates an interviewer through the workspace contract", async () => {
    const app = await NestFactory.create(InterviewerContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer())
      .post("/workspaces/test/setup/interviewers")
      .send({
        departmentId: "department-1",
        name: "技术面试官",
        prompt: "请进行技术面试",
        voice: "Chinese (Mandarin)_Reliable_Executive",
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(interviewer);
    expect(interviewerService.create).toHaveBeenCalledWith(
      "organization-1",
      "user-1",
      expect.objectContaining({ name: "技术面试官" }),
    );
  });
});
