import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ACCESS_PORT,
  WorkspaceAccessGuard,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingLiveTranscriptController } from "./meeting-live-transcript.controller.js";
import { MeetingLiveTranscriptService } from "./meeting-live-transcript.service.js";

const service = {
  authorize: vi.fn(),
  heartbeat: vi.fn(),
  release: vi.fn(),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u" },
    member: { id: "m", organizationId: "o", role: "member", userId: "u" },
    workspace: { id: "o", logo: null, metadata: null, name: "x", slug: "test" },
  })),
};

@Module({
  controllers: [MeetingLiveTranscriptController],
  providers: [
    { provide: MeetingLiveTranscriptService, useValue: service },
    WorkspaceAccessGuard,
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("meeting live transcript HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });

  it("validates authorization input and preserves 201/no-store", async () => {
    service.authorize.mockResolvedValue({
      clientSecret: "temporary",
      expiresAt: "2026-01-01T00:00:00.000Z",
      model: "qwen-audio-3.0-asr-flash-streaming",
      provider: "qwen",
      track: "microphone",
    });
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/workspaces/test/meetings/live-transcript")
      .send({ captureId: "550e8400-e29b-41d4-a716-446655440000", track: "microphone" });
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.clientSecret).toBe("temporary");
  });

  it("returns 409 when a heartbeat lease has expired", async () => {
    service.heartbeat.mockResolvedValue(false);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer()).post(
      "/workspaces/test/meetings/live-transcript/550e8400-e29b-41d4-a716-446655440000/heartbeat",
    );
    expect(response.status).toBe(409);
  });
});
