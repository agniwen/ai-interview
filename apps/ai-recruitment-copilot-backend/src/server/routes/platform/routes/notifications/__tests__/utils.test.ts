import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformNotificationDependencies } from "../utils";
import {
  grantPlatformNotificationDocumentAccess,
  previewPlatformFeishuNotification,
} from "../utils";

const mocks = {
  generateHrEvaluationWithPromptForInterview: vi.fn(),
  grantDocumentAccess: vi.fn(),
  loadCurrentUserAccount: vi.fn(),
  loadDocument: vi.fn(),
  loadPreview: vi.fn(),
};

const dependencies = {
  generateHrEvaluation: mocks.generateHrEvaluationWithPromptForInterview,
  grantDocumentAccess: mocks.grantDocumentAccess,
  loadCurrentUserAccount: mocks.loadCurrentUserAccount,
  loadDocument: mocks.loadDocument,
  loadPreview: mocks.loadPreview,
} satisfies PlatformNotificationDependencies;

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
