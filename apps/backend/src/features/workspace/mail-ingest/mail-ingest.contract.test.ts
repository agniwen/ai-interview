import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { MailIngestController } from "./mail-ingest.controller.js";
import { MailIngestService } from "./mail-ingest.service.js";
const service = {
  create: vi.fn(),
  getManaged: vi.fn(),
  listManaged: vi.fn(),
  listOwn: vi.fn(),
  messages: vi.fn(),
  pollNow: vi.fn(),
  removeOwn: vi.fn(),
  update: vi.fn(),
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
  controllers: [MailIngestController],
  providers: [
    { provide: MailIngestService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}
describe("workspace mail ingest public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects oversized managed pagination", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer()).get(
      "/api/w/test/studio/mail-ingest-accounts/managed?pageSize=1000",
    );
    expect(response.status).toBe(400);
    expect(service.listManaged).not.toHaveBeenCalled();
  });
});
