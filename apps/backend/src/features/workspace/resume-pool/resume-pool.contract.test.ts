/* oxlint-disable unicorn/no-await-expression-member -- Direct Supertest response assertions keep the HTTP contract cases compact. */
import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessGuard } from "../workspace-access.js";
import { WORKSPACE_ACCESS_PORT } from "../workspace.ports.js";
import { ResumePoolController } from "./resume-pool.controller.js";
import { ResumePoolService } from "./resume-pool.service.js";
import { InterviewCoreService } from "../interviews/interview-core.service.js";

const item = {
  candidateEmail: null,
  candidateName: "候选人",
  candidatePhone: null,
  createdAt: new Date().toISOString(),
  createdBy: "u1",
  duplicateMatch: null,
  id: "p1",
  importedAt: null,
  importedRecords: [],
  importedResumeRecordId: null,
  jobBindingMode: null,
  jobDescriptionId: null,
  jobDescriptionName: null,
  masteredSkills: [],
  notes: null,
  organizationId: "o1",
  profileHighlights: {},
  publishedAt: null,
  publishedBy: null,
  qualitativeRecommendationLevel: null,
  qualitativeResumeSummary: null,
  resumeContentHash: null,
  resumeEvaluationContractVersion: null,
  resumeEvaluationGeneratedAt: null,
  resumeFileName: null,
  resumeParseError: null,
  resumeParseRetryable: false,
  resumeParseStatus: "ready",
  resumeParsedAt: null,
  resumeProfileSnapshot: {},
  resumeStorageKey: null,
  scope: "private",
  skillsNormalized: [],
  sourceChannel: null,
  sourceOrganizationId: null,
  sourcePoolItemId: null,
  sourceUserId: null,
  status: "active",
  targetRole: null,
  updatedAt: new Date().toISOString(),
  uploaderEmail: null,
  uploaderImage: null,
  uploaderName: null,
  uploaderOrganizationName: null,
  workYears: null,
};
const service = {
  bind: vi.fn(async () => item),
  create: vi.fn(async () => item),
  delete: vi.fn(async () => ({ success: true })),
  duplicateMatches: vi.fn(async () => ({ matches: [] })),
  get: vi.fn(async () => item),
  getFile: vi.fn(),
  getJobMatch: vi.fn(),
  getPreview: vi.fn(),
  import: vi.fn(),
  list: vi.fn(async () => ({ records: [], total: 0 })),
  publish: vi.fn(async () => item),
  recommendations: vi.fn(),
  retryParse: vi.fn(),
  uploaders: vi.fn(async () => ({ records: [] })),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u1" },
    member: { id: "m1", organizationId: "o1", role: "admin", userId: "u1" },
    workspace: { id: "o1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};
const interviews = { visibleCreatorIds: vi.fn(async () => null) };
@Module({
  controllers: [ResumePoolController],
  providers: [
    WorkspaceAccessGuard,
    { provide: InterviewCoreService, useValue: interviews },
    { provide: ResumePoolService, useValue: service },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace resume pool public HTTP seam", () => {
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
  it("exposes list/detail/write routes with validated input", async () => {
    const instance = await app();
    expect(
      (await supertest(instance.getHttpServer()).get("/api/w/test/studio/resume-pool")).status,
    ).toBe(200);
    expect(
      (await supertest(instance.getHttpServer()).get("/api/w/test/studio/resume-pool/p1")).status,
    ).toBe(200);
    expect(
      (
        await supertest(instance.getHttpServer())
          .post("/api/w/test/studio/resume-pool/p1/bind")
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await supertest(instance.getHttpServer())
          .post("/api/w/test/studio/resume-pool/p1/bind")
          .send({ jobDescriptionId: "j1" })
      ).status,
    ).toBe(200);
  });
  it("requires both pool and JD permissions for recommendations", async () => {
    const instance = await app();
    service.recommendations.mockResolvedValueOnce({
      recommendations: [],
      resume: { id: "p1" },
      status: "disabled",
    });
    const response = await supertest(instance.getHttpServer())
      .post("/api/w/test/studio/resume-pool/p1/recommendations")
      .send({ topN: 5 });
    expect(response.status).toBe(200);
    expect(access.authorize).toHaveBeenCalledTimes(2);
  });
});
