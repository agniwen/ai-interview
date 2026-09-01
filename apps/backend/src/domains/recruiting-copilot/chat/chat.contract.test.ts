import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceAccessGuard,
  WORKSPACE_ACCESS_PORT,
} from "../../../infrastructure/http/workspace-access/index.js";
import { ChatController } from "./chat.controller.js";
import { ChatService } from "./chat.service.js";

const service = {
  confirmAction: vi.fn(),
  deleteConversation: vi.fn(),
  getAttachment: vi.fn(),
  getConversation: vi.fn(),
  listConversations: vi.fn(),
  matchAttachment: vi.fn(),
  persistMessage: vi.fn(),
  preflightUpload: vi.fn(),
  updateConversation: vi.fn(),
  upload: vi.fn(),
  upsertConversation: vi.fn(),
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
  controllers: [ChatController],
  providers: [
    WorkspaceAccessGuard,
    { provide: ChatService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class ChatContractTestModule {}

describe("workspace recruiting copilot chat HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  async function app() {
    const application = await NestFactory.create(ChatContractTestModule, { logger: false });
    application.useGlobalPipes(new StandardSchemaValidationPipe());
    await application.init();
    close = () => application.close();
    return application;
  }

  it("exposes conversation persistence and keeps ISO response dates", async () => {
    service.listConversations.mockResolvedValueOnce({
      conversations: [
        {
          createdAt: "2026-09-01T00:00:00.000Z",
          id: "chat-1",
          isTitleGenerating: false,
          title: "候选人分析",
          updatedAt: "2026-09-01T00:00:01.000Z",
        },
      ],
    });
    const application = await app();
    const response = await supertest(application.getHttpServer()).get(
      "/workspaces/test/copilot/conversations",
    );
    expect(response.status).toBe(200);
    expect(response.body.conversations[0].createdAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects an invalid upload preflight before storage access", async () => {
    const application = await app();
    const response = await supertest(application.getHttpServer())
      .post("/workspaces/test/copilot/uploads/preflight")
      .send({
        filename: "resume.exe",
        hash: "bad",
        mediaType: "application/x-msdownload",
        size: 1,
      });
    expect(response.status).toBe(400);
    expect(service.preflightUpload).not.toHaveBeenCalled();
  });

  it("routes preview suffix and ordinary attachment reads through one handler", async () => {
    service.getAttachment
      .mockResolvedValueOnce({
        body: Buffer.from("pdf"),
        filename: "resume-preview.pdf",
        mediaType: "application/pdf",
      })
      .mockResolvedValueOnce({
        body: Buffer.from("resume"),
        filename: "resume.pdf",
        mediaType: "application/pdf",
      });
    const application = await app();
    const preview = await supertest(application.getHttpServer()).get(
      "/workspaces/test/copilot/attachments/attachment-1-preview.pdf",
    );
    const original = await supertest(application.getHttpServer()).get(
      "/workspaces/test/copilot/attachments/attachment-1",
    );
    expect([preview.status, original.status]).toEqual([200, 200]);
    expect(service.getAttachment.mock.calls.map((call) => call[3])).toEqual([true, false]);
  });
});
