import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformNotificationDependencies,
  PlatformNotificationStructureDependencies,
} from "../utils";
import {
  grantPlatformNotificationDocumentAccess,
  previewPlatformFeishuNotification,
  updatePlatformNotificationDocumentStructure,
} from "../utils";

const mocks = {
  generateHrEvaluationWithPromptForInterview: vi.fn(),
  grantDocumentAccess: vi.fn(),
  loadCurrentUserAccount: vi.fn(),
  loadDocument: vi.fn(),
  loadPreview: vi.fn(),
  loadStructure: vi.fn(),
  updateDocumentStructure: vi.fn(),
};

const dependencies = {
  generateHrEvaluation: mocks.generateHrEvaluationWithPromptForInterview,
  grantDocumentAccess: mocks.grantDocumentAccess,
  loadCurrentUserAccount: mocks.loadCurrentUserAccount,
  loadDocument: mocks.loadDocument,
  loadPreview: mocks.loadPreview,
} satisfies PlatformNotificationDependencies;

const structureDependencies = {
  loadStructure: mocks.loadStructure,
  updateDocumentStructure: mocks.updateDocumentStructure,
} satisfies PlatformNotificationStructureDependencies;

interface TestNotificationDocumentRow {
  documentId: string | null;
  documentUrl: string | null;
  providerId: string;
  recipientOpenId: string;
}

interface TestNotificationPreviewRow {
  candidateName: string;
  conversationId: string | null;
  interviewRecordId: string;
  type: string;
}

function mockQueryRows(
  notificationRows: TestNotificationDocumentRow[],
  accountRows: { accountId: string }[] = [],
) {
  const [notification] = notificationRows;
  const [account] = accountRows;
  mocks.loadDocument.mockResolvedValue(notification ?? null);
  mocks.loadCurrentUserAccount.mockResolvedValue(account?.accountId ?? null);
}

function mockPreviewRows(rows: TestNotificationPreviewRow[]) {
  const [preview] = rows;
  mocks.loadPreview.mockResolvedValue(preview ?? null);
}

describe("grantPlatformNotificationDocumentAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants the current user through the same Feishu provider", async () => {
    mockQueryRows(
      [
        {
          documentId: "docx-1",
          documentUrl: "https://feishu.cn/docx/docx-1",
          providerId: "feishu-jiguang-hr",
          recipientOpenId: "ou_hr",
        },
      ],
      [{ accountId: "ou_admin" }],
    );

    await expect(
      grantPlatformNotificationDocumentAccess(
        { notificationId: "log-1", userId: "admin-1" },
        dependencies,
      ),
    ).resolves.toEqual({ documentUrl: "https://feishu.cn/docx/docx-1" });
    expect(mocks.grantDocumentAccess).toHaveBeenCalledWith("feishu-jiguang-hr", {
      documentId: "docx-1",
      recipientOpenId: "ou_admin",
    });
  });

  it("does not grant duplicate access when the current user is already the recipient", async () => {
    mockQueryRows(
      [
        {
          documentId: "docx-1",
          documentUrl: "https://feishu.cn/docx/docx-1",
          providerId: "feishu",
          recipientOpenId: "ou_admin",
        },
      ],
      [{ accountId: "ou_admin" }],
    );

    await grantPlatformNotificationDocumentAccess(
      { notificationId: "log-1", userId: "admin-1" },
      dependencies,
    );

    expect(mocks.grantDocumentAccess).not.toHaveBeenCalled();
  });

  it("requires an existing document and a matching Feishu account", async () => {
    mockQueryRows([
      {
        documentId: null,
        documentUrl: null,
        providerId: "feishu",
        recipientOpenId: "ou_hr",
      },
    ]);
    await expect(
      grantPlatformNotificationDocumentAccess(
        { notificationId: "log-1", userId: "admin-1" },
        dependencies,
      ),
    ).rejects.toThrow("飞书文档尚未生成，请先重新发送通知");

    mockQueryRows([
      {
        documentId: "docx-1",
        documentUrl: "https://feishu.cn/docx/docx-1",
        providerId: "feishu",
        recipientOpenId: "ou_hr",
      },
    ]);
    await expect(
      grantPlatformNotificationDocumentAccess(
        { notificationId: "log-2", userId: "admin-1" },
        dependencies,
      ),
    ).rejects.toThrow("当前管理员未绑定此通知对应的飞书账号");
  });
});

describe("previewPlatformFeishuNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the HR block without creating a document or sending a card", async () => {
    mockPreviewRows([
      {
        candidateName: "张三",
        conversationId: "conversation-1",
        interviewRecordId: "interview-1",
        type: "summary_ready",
      },
    ]);
    mocks.generateHrEvaluationWithPromptForInterview.mockResolvedValue({
      evaluation: { jobMotivation: "希望承担更完整的系统架构职责。" },
      prompt: "最终发送给模型的 Prompt",
    });

    const preview = await previewPlatformFeishuNotification("log-1", dependencies);

    expect(mocks.generateHrEvaluationWithPromptForInterview).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });
    expect(preview.prompt).toBe("最终发送给模型的 Prompt");
    expect(preview.title).toBe("张三 - HR面试评价预览");
    expect(preview.block.block_type).toBe(19);
    expect(JSON.stringify(preview.block.children)).toContain("1. 求职动机：");
    expect(JSON.stringify(preview.block.children)).toContain("希望承担更完整的系统架构职责。");
    expect(mocks.grantDocumentAccess).not.toHaveBeenCalled();
  });
});

describe("updatePlatformNotificationDocumentStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts current candidate sections into an existing summary document", async () => {
    mocks.loadStructure.mockResolvedValueOnce({
      documentId: "docx-1",
      documentUrl: "https://feishu.cn/docx/docx-1",
      interviewQuestions: [
        {
          difficulty: "medium",
          evaluationFocus: "验证系统设计能力",
          followUpDirections: "追问技术取舍",
          order: 1,
          question: "请介绍你主导的系统设计。",
        },
      ],
      providerId: "feishu",
      qualitativeResumeEvaluation: null,
      resumeEvaluationArtifactMode: null,
      type: "summary_ready",
    });
    mocks.updateDocumentStructure.mockResolvedValueOnce({
      insertedSections: ["recommendedQuestions"],
    });

    await expect(
      updatePlatformNotificationDocumentStructure("log-1", structureDependencies),
    ).resolves.toEqual({
      documentUrl: "https://feishu.cn/docx/docx-1",
      insertedSections: ["recommendedQuestions"],
    });
    expect(mocks.updateDocumentStructure).toHaveBeenCalledWith(
      "feishu",
      expect.objectContaining({
        documentId: "docx-1",
        recommendedQuestionsBlock: expect.objectContaining({ block_type: 19 }),
        resumeEvaluationBlock: undefined,
      }),
    );
  });

  it("requires an existing summary document", async () => {
    mocks.loadStructure.mockResolvedValueOnce(null);
    await expect(
      updatePlatformNotificationDocumentStructure("missing", structureDependencies),
    ).rejects.toThrow("通知记录不存在");

    mocks.loadStructure.mockResolvedValueOnce({
      documentId: null,
      documentUrl: null,
      interviewQuestions: [],
      providerId: "feishu",
      qualitativeResumeEvaluation: null,
      resumeEvaluationArtifactMode: null,
      type: "summary_ready",
    });
    await expect(
      updatePlatformNotificationDocumentStructure("no-doc", structureDependencies),
    ).rejects.toThrow("飞书文档尚未生成，请先重新发送通知");
  });
});
