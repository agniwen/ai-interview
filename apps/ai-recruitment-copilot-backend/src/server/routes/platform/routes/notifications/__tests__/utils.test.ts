import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  grantDocumentAccess: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: { select: mocks.select },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/feishu-docx", () => ({
  grantFeishuInterviewEvaluationDocxAccess: mocks.grantDocumentAccess,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { grantPlatformNotificationDocumentAccess } from "../utils";

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
