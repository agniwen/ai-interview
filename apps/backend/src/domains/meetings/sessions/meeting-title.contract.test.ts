/* oxlint-disable unicorn/no-await-expression-member -- Direct Supertest response assertions keep the HTTP contract cases compact. */
import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingTitleController } from "./meeting-title.controller.js";
import { MeetingTitleService, sanitizeRecordingTitle } from "./meeting-title.service.js";

const service = { generate: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "user-1" },
    member: { id: "member-1", organizationId: "org-1", role: "member", userId: "user-1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
@Module({
  controllers: [MeetingTitleController],
  providers: [
    { provide: MeetingTitleService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace meeting title HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("normalizes model titles and rejects sparse transcripts", async () => {
    expect(sanitizeRecordingTitle("“ 第三季度  产品发布安排。 ”")).toBe("第三季度 产品发布安排");
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    expect(
      (
        await supertest(app.getHttpServer())
          .post("/api/w/test/meetings/title")
          .send({ transcript: "too short" })
      ).status,
    ).toBe(400);
    expect(service.generate).not.toHaveBeenCalled();
  });
});
