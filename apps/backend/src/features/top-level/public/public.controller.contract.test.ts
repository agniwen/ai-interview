/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- The controller contract test reflects Nest metadata emitted by trusted decorators. */
import "reflect-metadata";

import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicController,
  PublicHumanInterviewCandidateMaterialsController,
} from "./public.controller.js";
import { TOP_LEVEL_PUBLIC_PORT } from "./public.port.js";
import type { TopLevelPublicPort } from "./public.port.js";

const respondAiInterviewInvitation = vi.fn(async () => ({
  action: "accept",
  status: "accepted",
}));

const publicPort = { respondAiInterviewInvitation } as unknown as TopLevelPublicPort;

@Module({
  controllers: [PublicController, PublicHumanInterviewCandidateMaterialsController],
  providers: [{ provide: TOP_LEVEL_PUBLIC_PORT, useValue: publicPort }],
})
class PublicContractTestModule {}

describe("public HTTP contract", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;

  beforeEach(async () => {
    app = await NestFactory.create(PublicContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("validates and forwards an AI interview invitation response", async () => {
    await supertest(app?.getHttpServer())
      .post("/api/public/ai-interview-invitations/invite-token/respond")
      .send({ action: "accept" })
      .expect(200, { action: "accept", status: "accepted" });

    expect(respondAiInterviewInvitation).toHaveBeenCalledWith({
      body: { action: "accept" },
      token: "invite-token",
    });
  });

  it("rejects an unsupported invitation action before the provider runs", async () => {
    await supertest(app?.getHttpServer())
      .post("/api/public/ai-interview-invitations/invite-token/respond")
      .send({ action: "maybe" })
      .expect(400);

    expect(respondAiInterviewInvitation).not.toHaveBeenCalled();
  });
});
