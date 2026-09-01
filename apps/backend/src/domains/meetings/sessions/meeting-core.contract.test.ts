import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingCoreController } from "./meeting-core.controller.js";
import { MeetingCoreService } from "./meeting-core.service.js";

const workspaceContext = {
  actor: { id: "user-1", name: "测试用户" },
  member: {
    id: "member-1",
    organizationId: "org-1",
    role: "member",
    userId: "user-1",
  },
  workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
};
const service = {
  detail: vi.fn(),
  list: vi.fn(async () => []),
  rename: vi.fn(),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => workspaceContext),
};

@Module({
  controllers: [MeetingCoreController],
  providers: [
    { provide: MeetingCoreService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting core public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("lists only through the resolved workspace identity", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer()).get("/api/w/test/meetings");

    expect(response.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith("org-1", "user-1", "member");
  });

  it("rejects an empty meeting title before calling persistence", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();

    const response = await supertest(app.getHttpServer())
      .patch("/api/w/test/meetings/meeting-1")
      .send({ title: "" });

    expect(response.status).toBe(400);
    expect(service.rename).not.toHaveBeenCalled();
  });
});
