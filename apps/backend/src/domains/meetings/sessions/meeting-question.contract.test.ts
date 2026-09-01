import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingQuestionController } from "./meeting-question.controller.js";
import { MeetingQuestionService } from "./meeting-question.service.js";
const service = { ask: vi.fn(), create: vi.fn(), get: vi.fn(), list: vi.fn() };
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u" },
    member: { id: "m", organizationId: "o", role: "member", userId: "u" },
    workspace: { id: "o", logo: null, metadata: null, name: "x", slug: "test" },
  })),
};
@Module({
  controllers: [MeetingQuestionController],
  providers: [
    { provide: MeetingQuestionService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}
describe("meeting questions HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects malformed idempotency requests", async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/workspaces/test/meetings/m/questions/t/messages")
      .send({ question: "谁负责？", requestId: "bad" });
    expect(response.status).toBe(400);
    expect(service.ask).not.toHaveBeenCalled();
  });
});
