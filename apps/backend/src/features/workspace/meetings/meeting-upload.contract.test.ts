import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { MeetingUploadController } from "./meeting-upload.controller.js";
import { MeetingUploadService } from "./meeting-upload.service.js";

const service = {
  complete: vi.fn(),
  create: vi.fn(),
  createMultipart: vi.fn(),
  heartbeat: vi.fn(),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "member", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
@Module({
  controllers: [MeetingUploadController],
  providers: [
    { provide: MeetingUploadService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting upload HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects incomplete source manifests before persistence", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/api/w/test/meetings")
      .send({
        assets: [],
        id: crypto.randomUUID(),
        manifestSha256: "a".repeat(64),
        savedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
