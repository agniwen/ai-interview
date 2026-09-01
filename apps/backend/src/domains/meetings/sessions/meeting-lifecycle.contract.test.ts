/* oxlint-disable unicorn/no-await-expression-member -- Direct Supertest response assertions keep the HTTP contract cases compact. */
import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingLifecycleController } from "./meeting-lifecycle.controller.js";
import { MeetingLifecycleService } from "./meeting-lifecycle.service.js";

const service = { listTrash: vi.fn(), purge: vi.fn(), restore: vi.fn(), trash: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "admin", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [MeetingLifecycleController],
  providers: [
    { provide: MeetingLifecycleService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting lifecycle HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("rejects invalid trash pagination and purge cleanup values", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
    await app.init();
    close = () => app.close();

    expect(
      (await supertest(app.getHttpServer()).get("/workspaces/test/meetings/trash?page=0")).status,
    ).toBe(400);
    expect(
      (
        await supertest(app.getHttpServer()).delete(
          "/workspaces/test/meetings/m-1?localRecoveryCleanup=unknown",
        )
      ).status,
    ).toBe(400);
    expect(service.listTrash).not.toHaveBeenCalled();
    expect(service.purge).not.toHaveBeenCalled();
  });
});
