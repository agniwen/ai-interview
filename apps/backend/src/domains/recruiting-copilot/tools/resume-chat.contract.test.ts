import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceAccessGuard,
  WORKSPACE_ACCESS_PORT,
} from "../../../infrastructure/http/workspace-access/index.js";
import { ResumeChatController } from "./resume-chat.controller.js";
import { ResumeChatService } from "./resume-chat.service.js";

const service = { chat: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "admin", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [ResumeChatController],
  providers: [
    WorkspaceAccessGuard,
    { provide: ResumeChatService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class ResumeChatContractTestModule {}

describe("workspace resume chat HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  async function app() {
    const application = await NestFactory.create(ResumeChatContractTestModule, { logger: false });
    application.useGlobalPipes(new StandardSchemaValidationPipe());
    await application.init();
    close = () => application.close();
    return application;
  }

  it("preserves the AI SDK v6 UI message stream response", async () => {
    service.chat.mockResolvedValueOnce(
      new Response('data: {"type":"finish"}\n\n', {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      }),
    );
    const application = await app();
    const response = await supertest(application.getHttpServer())
      .post("/workspaces/test/copilot/resume-chat")
      .send({
        messages: [{ id: "user-1", parts: [{ text: "你好", type: "text" }], role: "user" }],
      });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-vercel-ai-ui-message-stream"]).toBe("v1");
    expect(response.text).toContain('"type":"finish"');
    expect(service.chat).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: "user-1" } }),
      expect.objectContaining({ messages: expect.any(Array) }),
    );
  });

  it("rejects a focus that does not use the legacy id contract", async () => {
    const application = await app();
    const response = await supertest(application.getHttpServer())
      .post("/workspaces/test/copilot/resume-chat")
      .send({
        focus: { kind: "resume_record", resumeRecordId: "resume-1" },
        messages: [{ id: "user-1", parts: [{ text: "评价候选人", type: "text" }], role: "user" }],
      });
    expect(response.status).toBe(400);
    expect(service.chat).not.toHaveBeenCalled();
  });
});
