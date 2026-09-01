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
} from "../../../../infrastructure/http/workspace-access/index.js";
import { InterviewCoreService } from "./interview-core.service.js";
import {
  HumanInterviewMeetingController,
  InterviewCollectionController,
  InterviewDetailController,
  InterviewNotificationRecipientsController,
  InterviewRoundEmailController,
} from "./interview-workflow.controller.js";
import { InterviewWorkflowService } from "./interview-workflow.service.js";

const workflows = {
  agentInstructions: vi.fn(),
  bindings: vi.fn(async () => []),
  bulkRemoveRounds: vi.fn(async () => ({ deletedCount: 1, success: true })),
  cancelHumanRound: vi.fn(),
  cancelMeeting: vi.fn(async () => ({ id: "m1", status: "cancelled" })),
  cancelOffer: vi.fn(),
  completeHumanRound: vi.fn(),
  create: vi.fn(),
  createHumanRound: vi.fn(),
  createMeeting: vi.fn(async () => ({ id: "m1", status: "scheduled" })),
  createOffer: vi.fn(),
  deleteSubmission: vi.fn(),
  detail: vi.fn(async () => ({ id: "round-1" })),
  endMeeting: vi.fn(async () => ({ id: "m1", status: "ended" })),
  evaluationDocument: vi.fn(),
  formSubmissions: vi.fn(async () => ({ submissions: [] })),
  getMeeting: vi.fn(async () => ({ id: "m1", status: "scheduled" })),
  humanRounds: vi.fn(async () => []),
  issueMeetingLinks: vi.fn(),
  list: vi.fn(async () => ({ page: 1, pageSize: 20, records: [], total: 0, totalPages: 0 })),
  meetingLiveKitToken: vi.fn(),
  meetings: vi.fn(async () => []),
  notificationRecipients: vi.fn(async () => ({ fallbackToInitiator: true, records: [] })),
  offers: vi.fn(async () => []),
  patchRound: vi.fn(),
  recording: vi.fn(),
  refreshSnapshot: vi.fn(),
  removeRound: vi.fn(async () => ({ success: true })),
  replaceBindings: vi.fn(async () => []),
  replaceNotificationRecipients: vi.fn(async () => ({ fallbackToInitiator: false, records: [] })),
  reports: vi.fn(async () => []),
  resetRound: vi.fn(),
  resolve: vi.fn(async () => ({ id: "round-1", kind: "round" })),
  respondOffer: vi.fn(),
  roundEmailSummary: vi.fn(async () => ({ records: [] })),
  sendOffer: vi.fn(),
  sendRoundEmail: vi.fn(),
  syncMeetingToFeishu: vi.fn(),
  transition: vi.fn(async () => ({ ok: true })),
  updateExpectations: vi.fn(),
  updateHumanRound: vi.fn(),
  updateMeeting: vi.fn(),
  updateOffer: vi.fn(),
};
const access = {
  authorize: vi.fn(async () => true),
  resolve: vi.fn(async () => ({
    actor: { id: "u1" },
    member: { id: "member-1", organizationId: "org-1", role: "admin", userId: "u1" },
    workspace: { id: "org-1", logo: null, metadata: null, name: "测试", slug: "test" },
  })),
};

@Module({
  controllers: [
    InterviewCollectionController,
    HumanInterviewMeetingController,
    InterviewRoundEmailController,
    InterviewNotificationRecipientsController,
    InterviewDetailController,
  ],
  providers: [
    WorkspaceAccessGuard,
    { provide: InterviewCoreService, useValue: { visibleCreatorIds: vi.fn(async () => null) } },
    { provide: InterviewWorkflowService, useValue: workflows },
    { provide: WORKSPACE_ACCESS_PORT, useValue: access },
  ],
})
class TestModule {}

describe("workspace interview workflows HTTP seam", () => {
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

  it("keeps collection and fixed-prefix routes ahead of dynamic round routes", async () => {
    const instance = await app();
    const collectionResponse = await supertest(instance.getHttpServer()).get(
      "/api/w/test/studio/interviews",
    );
    expect(collectionResponse.status).toBe(200);
    const resolveResponse = await supertest(instance.getHttpServer()).get(
      "/api/w/test/studio/interviews/resolve?id=round-1",
    );
    expect(resolveResponse.status).toBe(200);
    const meetingsResponse = await supertest(instance.getHttpServer()).get(
      "/api/w/test/studio/interviews/human-interview-meetings",
    );
    expect(meetingsResponse.status).toBe(200);
    const summaryResponse = await supertest(instance.getHttpServer()).get(
      "/api/w/test/studio/interviews/round-emails/summary",
    );
    expect(summaryResponse.status).toBe(200);
    expect(workflows.detail).not.toHaveBeenCalled();
  });

  it("validates state-machine mutations before invoking services", async () => {
    const instance = await app();
    const transitionResponse = await supertest(instance.getHttpServer())
      .post("/api/w/test/studio/interviews/candidate-1/transition")
      .send({ outcome: "in_pipeline", pipelineStage: "closed" });
    expect(transitionResponse.status).toBe(400);
    const humanRoundResponse = await supertest(instance.getHttpServer())
      .post("/api/w/test/studio/interviews/candidate-1/human-interview-rounds")
      .send({ format: "online", interviewerIds: [], label: "" });
    expect(humanRoundResponse.status).toBe(400);
    const offerResponse = await supertest(instance.getHttpServer())
      .post("/api/w/test/studio/interviews/candidate-1/offer-drafts")
      .send({ baseSalary: -1, position: "工程师" });
    expect(offerResponse.status).toBe(400);
    expect(workflows.transition).not.toHaveBeenCalled();
    expect(workflows.createHumanRound).not.toHaveBeenCalled();
    expect(workflows.createOffer).not.toHaveBeenCalled();
  });

  it("replaces notification recipients through the candidate-scoped route", async () => {
    const instance = await app();
    const response = await supertest(instance.getHttpServer())
      .put("/api/w/test/studio/interviews/candidate-1/notification-recipients")
      .send({ userIds: ["u1"] });
    expect(response.status).toBe(200);
    expect(workflows.replaceNotificationRecipients).toHaveBeenCalledWith(
      "org-1",
      "u1",
      "candidate-1",
      { userIds: ["u1"] },
    );
  });
});
