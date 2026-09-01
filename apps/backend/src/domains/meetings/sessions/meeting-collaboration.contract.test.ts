import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingCollaborationController } from "./meeting-collaboration.controller.js";
import { MeetingCollaborationService } from "./meeting-collaboration.service.js";

const service = { createNote: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1", name: "用户" },
    member: { id: "member-1", organizationId: "org-1", role: "member", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [MeetingCollaborationController],
  providers: [
    { provide: MeetingCollaborationService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting collaboration public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("rejects an empty note before persistence", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/api/w/test/meetings/meeting-1/notes")
      .send({ body: "", meetingTimeMs: 0 });
    expect(response.status).toBe(400);
    expect(service.createNote).not.toHaveBeenCalled();
  });
});
