import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceAccessGuard,
  WORKSPACE_ACCESS_PORT,
} from "../../../infrastructure/http/workspace-access/index.js";
import { JobEvaluationLifecycleController } from "./job-evaluation-lifecycle.controller.js";
import { JobEvaluationLifecycleService } from "./job-evaluation-lifecycle.service.js";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
const lifecycle = {
  createUpgrade: vi.fn(),
  discardUpgrade: vi.fn(),
  getUpgrade: vi.fn(),
  preview: vi.fn(),
  previewUpgrade: vi.fn(),
  publish: vi.fn(),
  publishUpgrade: vi.fn(),
  saveRuleDraft: vi.fn(),
  saveUpgradeRuleDraft: vi.fn(),
  toRuleDraft: vi.fn(),
  updateUpgrade: vi.fn(),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u1" },
    member: { id: "m1", organizationId: "o1", role: "admin", userId: "u1" },
    workspace: { id: "o1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
@Module({
  controllers: [JobEvaluationLifecycleController],
  providers: [
    WorkspaceAccessGuard,
    { provide: JobEvaluationLifecycleService, useValue: lifecycle },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}
describe("job evaluation lifecycle HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  async function app() {
    const instance = await NestFactory.create(TestModule, { logger: false });
    instance.useGlobalPipes(new StandardSchemaValidationPipe());
    instance.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(instance.get(Reflector)),
    );
    await instance.init();
    close = () => instance.close();
    return instance;
  }
  it("validates optimistic upgrade mutations", async () => {
    const instance = await app();
    const updateResponse = await supertest(instance.getHttpServer())
      .put("/api/w/test/studio/job-descriptions/j1/upgrade")
      .send({});
    expect(updateResponse.status).toBe(400);
    const deleteResponse = await supertest(instance.getHttpServer()).delete(
      "/api/w/test/studio/job-descriptions/j1/upgrade",
    );
    expect(deleteResponse.status).toBe(400);
  });
  it("exposes draft creation under update permission", async () => {
    const instance = await app();
    lifecycle.createUpgrade.mockResolvedValueOnce({
      blueprintPreview: null,
      blueprintPreviewGeneratedAt: null,
      blueprintPreviewHash: null,
      blueprintPreviewInputHash: null,
      createdAt: new Date().toISOString(),
      id: "d1",
      jobDescriptionId: "j1",
      organizationId: "o1",
      prompt: "JD",
      structuredConfig: createDefaultJobDescriptionStructuredConfig(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });
    const response = await supertest(instance.getHttpServer()).post(
      "/api/w/test/studio/job-descriptions/j1/upgrade",
    );
    expect(response.status).toBe(201);
    expect(lifecycle.createUpgrade).toHaveBeenCalledWith("o1", "u1", "j1");
  });
});
