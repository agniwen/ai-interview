import "reflect-metadata";

import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JoinController } from "./join.controller.js";
import { TOP_LEVEL_JOIN_PORT } from "./join.port.js";
import type { TopLevelJoinPort } from "./join.port.js";
import { TOP_LEVEL_AUTH_PORT } from "../top-level.ports.js";
import type { TopLevelAuthPort } from "../top-level.ports.js";

const joinPort: TopLevelJoinPort = {
  accept: vi.fn(),
  preview: vi.fn(async ({ code, userId }) => ({
    alreadyMember: userId === "usr_1",
    initialRole: "member",
    valid: true,
    workspace: {
      id: "org_1",
      logo: null,
      name: `Workspace ${code.slice(0, 4)}`,
      slug: "arc",
    },
  })),
};

const authPort: TopLevelAuthPort = {
  actor: (request) => {
    const userId = request.header("x-test-user-id");
    return userId ? { id: userId } : null;
  },
  requireActor: (request) => {
    const userId = request.header("x-test-user-id");
    if (!userId) {
      throw new Error("test actor is required");
    }
    return { id: userId };
  },
  requireAgent: () => {},
  requirePlatformAdministrator: () => ({ id: "platform_admin" }),
};

@Module({
  controllers: [JoinController],
  providers: [
    { provide: TOP_LEVEL_AUTH_PORT, useValue: authPort },
    { provide: TOP_LEVEL_JOIN_PORT, useValue: joinPort },
  ],
})
class JoinContractTestModule {}

describe("join HTTP contract", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeEach(async () => {
    app = await NestFactory.create(JoinContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns the workspace preview for a valid invite code", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/api/join/ABCD1234EFGH5678/preview")
      .set("x-test-user-id", "usr_1")
      .expect(200);

    expect(response.body).toEqual({
      alreadyMember: true,
      initialRole: "member",
      valid: true,
      workspace: {
        id: "org_1",
        logo: null,
        name: "Workspace ABCD",
        slug: "arc",
      },
    });
    expect(joinPort.preview).toHaveBeenCalledWith({
      code: "ABCD1234EFGH5678",
      userId: "usr_1",
    });
  });

  it("rejects an invite code outside the public contract", async () => {
    const response = await supertest(app.getHttpServer())
      .get("/api/join/not-valid/preview")
      .expect(400);

    expect(response.body).toMatchObject({
      error: "Bad Request",
      statusCode: 400,
    });
    expect(joinPort.preview).not.toHaveBeenCalled();
  });
});
