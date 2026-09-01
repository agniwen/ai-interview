/* oxlint-disable unicorn/no-await-expression-member -- Direct Supertest response assertions keep the HTTP contract cases compact. */
import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { MeetingExportController } from "./meeting-export.controller.js";
import { MeetingExportService } from "./meeting-export.service.js";
const service = { prepare: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u" },
    member: { id: "m", organizationId: "o", role: "member", userId: "u" },
    workspace: { id: "o", logo: null, metadata: null, name: "x", slug: "test" },
  })),
};
@Module({
  controllers: [MeetingExportController],
  providers: [
    { provide: MeetingExportService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}
describe("meeting export HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects unsupported formats and tracks", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    expect(
      (await supertest(app.getHttpServer()).get("/api/w/test/meetings/m/exports/provider-json"))
        .status,
    ).toBe(400);
    expect(
      (
        await supertest(app.getHttpServer()).get(
          "/api/w/test/meetings/m/exports/audio?track=internal",
        )
      ).status,
    ).toBe(400);
    expect(service.prepare).not.toHaveBeenCalled();
  });
});
