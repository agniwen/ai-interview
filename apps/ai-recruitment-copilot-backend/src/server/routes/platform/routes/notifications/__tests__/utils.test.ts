import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  generateHrEvaluationWithPromptForInterview: vi.fn(),
  grantDocumentAccess: vi.fn(),
  select: vi.fn(),
  sendCard: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: { select: mocks.select },
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-hr-evaluation",
  () => ({
    generateFeishuHrEvaluationWithPromptForInterview:
      mocks.generateHrEvaluationWithPromptForInterview,
  }),
);

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/feishu-docx", () => ({
  createFeishuInterviewEvaluationDocx: mocks.createDocument,
  grantFeishuInterviewEvaluationDocxAccess: mocks.grantDocumentAccess,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/bot", () => ({
  postFeishuDirectCard: mocks.sendCard,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import {
  grantPlatformNotificationDocumentAccess,
  previewPlatformFeishuNotification,
} from "../utils";

function mockQueryRows(notificationRows: unknown[], accountRows: unknown[] = []) {
  mocks.select.mockReset();
  mocks.select
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(notificationRows) }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(accountRows) }),
        }),
      }),
    });
}

function mockPreviewRows(rows: unknown[]) {
  mocks.select.mockReset();
  mocks.select.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => ({
        where: () => ({ limit: () => Promise.resolve(rows) }),
      }),
    }),
  });
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
      grantPlatformNotificationDocumentAccess({ notificationId: "log-1", userId: "admin-1" }),
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

    await grantPlatformNotificationDocumentAccess({
      notificationId: "log-1",
      userId: "admin-1",
    });

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
      grantPlatformNotificationDocumentAccess({ notificationId: "log-1", userId: "admin-1" }),
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
      grantPlatformNotificationDocumentAccess({ notificationId: "log-2", userId: "admin-1" }),
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

    const preview = await previewPlatformFeishuNotification("log-1");

    expect(mocks.generateHrEvaluationWithPromptForInterview).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });
    expect(preview.prompt).toBe("最终发送给模型的 Prompt");
    expect(preview.title).toBe("张三 - HR面试评价预览");
    expect(preview.block.block_type).toBe(19);
    expect(JSON.stringify(preview.block.children)).toContain("1. 求职动机：");
    expect(JSON.stringify(preview.block.children)).toContain("希望承担更完整的系统架构职责。");
    expect(mocks.createDocument).not.toHaveBeenCalled();
    expect(mocks.grantDocumentAccess).not.toHaveBeenCalled();
    expect(mocks.sendCard).not.toHaveBeenCalled();
  });
});
