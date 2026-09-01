import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingRecruitingController } from "./meeting-recruiting.controller.js";
import { MeetingRecruitingService } from "./meeting-recruiting.service.js";

const service = { candidates: vi.fn(), get: vi.fn(), update: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "admin", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [MeetingRecruitingController],
  providers: [
    { provide: MeetingRecruitingService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting recruiting context HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("rejects invalid candidate paging and empty recruiting record ids", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
    await app.init();
    close = () => app.close();

    const candidates = await supertest(app.getHttpServer()).get(
      "/api/w/test/meetings/meeting-1/recruiting-context/candidates?limit=51",
    );
    expect(candidates.status).toBe(400);
    expect(service.candidates).not.toHaveBeenCalled();

    const update = await supertest(app.getHttpServer())
      .put("/api/w/test/meetings/meeting-1/recruiting-context")
      .send({ recruitingRecordId: "" });
    expect(update.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
});
