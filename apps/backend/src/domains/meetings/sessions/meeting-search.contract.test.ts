/* oxlint-disable unicorn/no-await-expression-member -- Direct Supertest response assertions keep the HTTP contract cases compact. */
import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingSearchController } from "./meeting-search.controller.js";
import { MeetingSearchService } from "./meeting-search.service.js";

const service = { search: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "member", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
@Module({
  controllers: [MeetingSearchController],
  providers: [
    { provide: MeetingSearchService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting search HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("validates query length and IANA time zones", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
    await app.init();
    close = () => app.close();
    expect(
      (await supertest(app.getHttpServer()).get("/workspaces/test/meetings/search?q=x")).status,
    ).toBe(400);
    expect(
      (
        await supertest(app.getHttpServer()).get(
          "/workspaces/test/meetings/search?q=valid&timeZone=Mars/Base",
        )
      ).status,
    ).toBe(400);
    expect(service.search).not.toHaveBeenCalled();
  });
});
