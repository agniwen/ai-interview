import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { InviteLinkController } from "./invite-link.controller.js";
import { InviteLinkService } from "./invite-link.service.js";

const service = {
  create: vi.fn(),
  disable: vi.fn(),
  enable: vi.fn(),
  list: vi.fn(),
  members: vi.fn(),
  updateRole: vi.fn(),
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
  controllers: [InviteLinkController],
  providers: [
    WorkspaceAccessGuard,
    { provide: InviteLinkService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class InviteLinkContractTestModule {}

describe("workspace invite links public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("validates role updates", async () => {
    const app = await NestFactory.create(InviteLinkContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .patch("/api/w/test/studio/workspace/invite-links/link-1")
      .send({ initialRole: "" });
    expect(response.status).toBe(400);
    expect(service.updateRole).not.toHaveBeenCalled();
  });

  it("rejects an invalid invitation email", async () => {
    const app = await NestFactory.create(InviteLinkContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/api/w/test/studio/workspace/invite-links")
      .send({ email: "not-an-email", initialRole: "member" });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
