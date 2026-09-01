import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { MeetingProcessingController } from "./meeting-processing.controller.js";
import { MeetingProcessingService } from "./meeting-processing.service.js";

const service = {
  correctTranscript: vi.fn(),
  retryTranscript: vi.fn(async () => ({ state: "processing" })),
  updatePolicy: vi.fn(),
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
  controllers: [MeetingProcessingController],
  providers: [
    { provide: MeetingProcessingService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting processing public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects a fallback provider that is not allowed", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .put("/api/w/test/meetings/transcription-policy")
      .send({
        allowedProviders: ["qwen"],
        fallbackProvider: "openai",
        selectedProvider: "qwen",
        selectionReason: "经过真实音频评测后选择此模型",
      });
    expect(response.status).toBe(400);
    expect(service.updatePolicy).not.toHaveBeenCalled();
  });

  it("validates human revisions and keeps retry asynchronous", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();

    const invalid = await supertest(app.getHttpServer())
      .post("/api/w/test/meetings/meeting-1/transcript/corrections")
      .send({ language: null, sourceRevisionId: "not-a-uuid", turns: [] });
    expect(invalid.status).toBe(400);
    expect(service.correctTranscript).not.toHaveBeenCalled();

    const retry = await supertest(app.getHttpServer()).post(
      "/api/w/test/meetings/meeting-1/transcript/retry",
    );
    expect(retry.status).toBe(202);
    expect(service.retryTranscript).toHaveBeenCalledWith("org-1", "user-1", "admin", "meeting-1");
  });
});
