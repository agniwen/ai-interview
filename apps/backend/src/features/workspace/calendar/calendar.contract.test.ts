import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { CalendarController } from "./calendar.controller.js";
import { CalendarService } from "./calendar.service.js";

const service = { list: vi.fn(), preview: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "member", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
@Module({
  controllers: [CalendarController],
  providers: [
    { provide: CalendarService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace calendar public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects a reversed date range", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer()).get(
      "/api/w/test/studio/calendar?start=2026-09-02T00:00:00Z&end=2026-09-01T00:00:00Z",
    );
    expect(response.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });
});
