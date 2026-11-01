import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmRecruitingAction as confirmRecruitingActionWithDependencies } from "../actions";
import type { RecruitingActionDependencies } from "../actions";

const mocks = {
  loadRecruitingJobDescriptionById: vi.fn(),
  loadResumePoolItem: vi.fn(),
  patchRecruitingActionConfirmationInConversation: vi.fn(),
  resumeRecordExists: vi.fn(),
  upsertConversationContextJobBinding: vi.fn(),
};

const dependencies: RecruitingActionDependencies = {
  loadJobDescription: mocks.loadRecruitingJobDescriptionById,
  loadPoolItem: mocks.loadResumePoolItem,
  patchConfirmation: mocks.patchRecruitingActionConfirmationInConversation,
  resumeRecordExists: mocks.resumeRecordExists,
  upsertBinding: mocks.upsertConversationContextJobBinding,
};

function confirmRecruitingAction(
  input: Parameters<typeof confirmRecruitingActionWithDependencies>[0],
) {
  return confirmRecruitingActionWithDependencies(input, dependencies);
}

describe("confirmRecruitingAction bind_* conversation context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadRecruitingJobDescriptionById.mockResolvedValue({
      id: "jd-1",
      name: "前端工程师",
    });
    mocks.resumeRecordExists.mockResolvedValue(true);
    mocks.loadResumePoolItem.mockResolvedValue({
      id: "pool-1",
      jobDescriptionId: null,
    });
    mocks.upsertConversationContextJobBinding.mockResolvedValue({
      previousJobDescriptionId: null,
      status: "updated",
    });
    mocks.patchRecruitingActionConfirmationInConversation.mockResolvedValue(1);
  });

  it("stores resume-record bind as a chat message binding", async () => {
    const result = await confirmRecruitingAction({
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      authorize: vi.fn() as never,
      conversationId: "conversation-1",
      operatorId: "user-1",
      organizationId: "org-1",
      proposal: {
        explanation: "先按前端岗位分析。",
        id: "proposal-1",
        payload: {
          jobDescriptionId: "jd-1",
          resumeRecordId: "resume-1",
        },
        title: "关联岗位",
        type: "bind_candidate_to_job",
      },
      visibilityScope: { kind: "all" },
    });

    expect(mocks.upsertConversationContextJobBinding).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      jobDescriptionId: "jd-1",
      jobDescriptionName: "前端工程师",
      kind: "resume_record",
      organizationId: "org-1",
      recordId: "resume-1",
      summaryText: expect.stringContaining("前端工程师"),
    });
    expect(mocks.patchRecruitingActionConfirmationInConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmation: expect.objectContaining({
          jobDescriptionId: "jd-1",
          jobDescriptionName: "前端工程师",
          status: "confirmed",
        }),
        conversationId: "conversation-1",
        proposalId: "proposal-1",
      }),
    );
    expect(result.status).toBe("executed");
    expect(result).toMatchObject({
      actionType: "bind_candidate_to_job",
      confirmation: expect.objectContaining({
        jobDescriptionId: "jd-1",
        status: "confirmed",
      }),
      message: "已在本对话中将该候选人关联到所选岗位（仅影响本轮分析，未改招聘台数据）。",
    });
  });

  it("stores pool-item bind as a chat message binding", async () => {
    const result = await confirmRecruitingAction({
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      authorize: vi.fn() as never,
      conversationId: "conversation-1",
      operatorId: "user-1",
      organizationId: "org-1",
      proposal: {
        explanation: "先按前端岗位分析。",
        id: "proposal-2",
        payload: {
          jobDescriptionId: "jd-1",
          poolItemId: "pool:pool-1",
        },
        title: "关联岗位",
        type: "bind_pool_item_to_job",
      },
      visibilityScope: { kind: "all" },
    });

    expect(mocks.upsertConversationContextJobBinding).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      jobDescriptionId: "jd-1",
      jobDescriptionName: "前端工程师",
      kind: "resume_pool_item",
      organizationId: "org-1",
      recordId: "pool-1",
      summaryText: expect.stringContaining("前端工程师"),
    });
    expect(result.status).toBe("executed");
    expect(result).toMatchObject({
      actionType: "bind_pool_item_to_job",
      confirmation: expect.objectContaining({
        jobDescriptionId: "jd-1",
        status: "confirmed",
      }),
      message: "已在本对话中将该人才库条目关联到所选岗位（仅影响本轮分析，未改人才库数据）。",
    });
  });

  it("persists ignore decision into tool JSON without writing a job binding", async () => {
    const result = await confirmRecruitingAction({
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      authorize: vi.fn() as never,
      conversationId: "conversation-1",
      decision: "ignore",
      operatorId: "user-1",
      organizationId: "org-1",
      proposal: {
        explanation: "先选岗位。",
        id: "conversation-bind:resume_record:resume-1",
        payload: {
          resumeRecordId: "resume-1",
        },
        title: "关联岗位",
        type: "bind_candidate_to_job",
      },
      visibilityScope: { kind: "all" },
    });

    expect(mocks.upsertConversationContextJobBinding).not.toHaveBeenCalled();
    expect(mocks.patchRecruitingActionConfirmationInConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmation: expect.objectContaining({ status: "ignored" }),
        proposalId: "conversation-bind:resume_record:resume-1",
      }),
    );
    expect(result).toMatchObject({
      actionType: "bind_candidate_to_job",
      confirmation: expect.objectContaining({ status: "ignored" }),
      status: "executed",
    });
  });
});
