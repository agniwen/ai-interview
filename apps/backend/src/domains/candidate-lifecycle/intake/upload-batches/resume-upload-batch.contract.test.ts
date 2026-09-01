import { Module, StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceAccessGuard,
  WORKSPACE_ACCESS_PORT,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { ResumeUploadBatchController } from "./resume-upload-batch.controller.js";
import { ResumeUploadBatchService } from "./resume-upload-batch.service.js";

const service = {
  active: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  processNext: vi.fn(async () => ({ batch: {}, done: false, item: {} })),
  remove: vi.fn(),
  resume: vi.fn(),
  upload: vi.fn(),
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
  controllers: [ResumeUploadBatchController],
  providers: [
    WorkspaceAccessGuard,
    { provide: ResumeUploadBatchService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class ResumeUploadBatchContractTestModule {}

describe("workspace resume upload batches public HTTP seam", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
    vi.clearAllMocks();
  });
  it("rejects an empty batch before invoking persistence", async () => {
    const app = await NestFactory.create(ResumeUploadBatchContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer())
      .post("/workspaces/test/candidates/intake/upload-batches")
      .send({ dedupPolicy: "skip", files: [], jdMode: "none", target: "resume_library" });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("delegates process-next to the queue-backed service", async () => {
    const app = await NestFactory.create(ResumeUploadBatchContractTestModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    close = () => app.close();
    const response = await supertest(app.getHttpServer()).post(
      "/workspaces/test/candidates/intake/upload-batches/batch-1/process-next",
    );
    expect(response.status).toBe(200);
    expect(service.processNext).toHaveBeenCalledWith("org-1", "user-1", "batch-1");
  });
});
