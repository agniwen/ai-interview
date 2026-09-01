import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { MeetingIntelligenceController } from "./meeting-intelligence.controller.js";
import { MeetingIntelligenceService } from "./meeting-intelligence.service.js";

const service = { get: vi.fn(), regenerate: vi.fn(async () => ({ state: "processing" })) };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "admin", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [MeetingIntelligenceController],
  providers: [
    { provide: MeetingIntelligenceService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting intelligence HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("accepts only a versioned intelligence template and responds asynchronously", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();

    const invalid = await supertest(app.getHttpServer())
      .post("/api/w/test/meetings/meeting-1/intelligence")
      .send({ template: "custom" });
    expect(invalid.status).toBe(400);
    expect(service.regenerate).not.toHaveBeenCalled();

    const accepted = await supertest(app.getHttpServer())
      .post("/api/w/test/meetings/meeting-1/intelligence")
      .send({ template: "general" });
    expect(accepted.status).toBe(202);
    expect(service.regenerate).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "admin",
      "meeting-1",
      "general",
    );
  });
});
