import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@app/server/server/factory";
import { NotificationDocumentAccessError } from "../utils";
import { createPlatformRouter } from "../../../route";

const mocks = {
  grantDocumentAccess: vi.fn(),
  previewNotification: vi.fn(),
  queryNotifications: vi.fn(),
  resendNotification: vi.fn(),
  updateDocumentStructure: vi.fn(),
};

function makeApp(role?: string) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      if (role) {
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("user", { id: "user_1", role } as never);
      }
      await next();
    })
    .route("/platform", createPlatformRouter({ notifications: mocks }));
}

describe("platform notifications routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryNotifications.mockResolvedValue({ records: [], total: 0 });
  });

  it("keeps the notifications resource behind the platform admin boundary", async () => {
    const response = await makeApp().request("/platform/notifications");

    expect(response.status).toBe(401);
    expect(mocks.queryNotifications).not.toHaveBeenCalled();
  });

  it("preserves the mounted list path and response", async () => {
    const response = await makeApp("admin").request("/platform/notifications?page=1&pageSize=20");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ records: [], total: 0 });
  });

  it("preserves resend success and error statuses", async () => {
    mocks.resendNotification.mockResolvedValueOnce({ ok: true });
    const success = await makeApp("admin").request("/platform/notifications/log_1/resend", {
      method: "POST",
    });
    mocks.resendNotification.mockRejectedValueOnce(new Error("通知记录不存在"));
    const missing = await makeApp("admin").request("/platform/notifications/log_2/resend", {
      method: "POST",
    });
    mocks.resendNotification.mockRejectedValueOnce(new Error("发送失败"));
    const invalid = await makeApp("admin").request("/platform/notifications/log_3/resend", {
      method: "POST",
    });

    expect(success.status).toBe(200);
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });

  it("returns an HR evaluation preview without sending a notification", async () => {
    mocks.previewNotification.mockResolvedValueOnce({
      block: { block_type: 19, children: [] },
      prompt: "最终发送给模型的 Prompt",
      title: "张三 - HR面试评价预览",
    });

    const response = await makeApp("admin").request("/platform/notifications/log_1/debug-preview", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      block: { block_type: 19, children: [] },
      prompt: "最终发送给模型的 Prompt",
      title: "张三 - HR面试评价预览",
    });
    expect(mocks.previewNotification).toHaveBeenCalledWith("log_1");
    expect(mocks.resendNotification).not.toHaveBeenCalled();
  });

  it("updates an existing Feishu document structure without resending the notification", async () => {
    mocks.updateDocumentStructure.mockResolvedValueOnce({
      documentUrl: "https://feishu.cn/docx/docx-1",
      insertedSections: ["resumeEvaluation", "recommendedQuestions"],
      updatedSections: [],
    });

    const response = await makeApp("admin").request(
      "/platform/notifications/log_1/update-document-structure",
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      documentUrl: "https://feishu.cn/docx/docx-1",
      insertedSections: ["resumeEvaluation", "recommendedQuestions"],
      updatedSections: [],
    });
    expect(mocks.updateDocumentStructure).toHaveBeenCalledWith("log_1");
    expect(mocks.resendNotification).not.toHaveBeenCalled();
  });

  it("reports unexpected Feishu update failures as server errors", async () => {
    mocks.updateDocumentStructure.mockRejectedValueOnce(new Error("Feishu unavailable"));

    const response = await makeApp("admin").request(
      "/platform/notifications/log_1/update-document-structure",
      { method: "POST" },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "更新飞书文档结构失败" });
  });

  it("returns 500 when AI preview generation fails unexpectedly", async () => {
    mocks.previewNotification.mockRejectedValueOnce(new Error("model unavailable"));

    const response = await makeApp("admin").request("/platform/notifications/log_1/debug-preview", {
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "生成飞书通知预览失败" });
  });

  it("grants the current platform admin access before returning the document URL", async () => {
    mocks.grantDocumentAccess.mockResolvedValueOnce({
      documentUrl: "https://feishu.cn/docx/docx-1",
    });

    const response = await makeApp("admin").request(
      "/platform/notifications/log_1/document-access",
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      documentUrl: "https://feishu.cn/docx/docx-1",
    });
    expect(mocks.grantDocumentAccess).toHaveBeenCalledWith({
      notificationId: "log_1",
      userId: "user_1",
    });
  });

  it("returns actionable document access errors", async () => {
    mocks.grantDocumentAccess.mockRejectedValueOnce(
      new NotificationDocumentAccessError("NOTIFICATION_NOT_FOUND", "通知记录不存在", 404),
    );
    const missing = await makeApp("admin").request(
      "/platform/notifications/missing/document-access",
      { method: "POST" },
    );
    mocks.grantDocumentAccess.mockRejectedValueOnce(
      new NotificationDocumentAccessError(
        "DOCUMENT_NOT_GENERATED",
        "飞书文档尚未生成，请先重新发送通知",
        409,
      ),
    );
    const notGenerated = await makeApp("admin").request(
      "/platform/notifications/no-doc/document-access",
      { method: "POST" },
    );
    mocks.grantDocumentAccess.mockRejectedValueOnce(
      new NotificationDocumentAccessError(
        "FEISHU_ACCOUNT_NOT_LINKED",
        "当前管理员未绑定此通知对应的飞书账号",
        409,
      ),
    );
    const unlinked = await makeApp("admin").request(
      "/platform/notifications/unlinked/document-access",
      { method: "POST" },
    );

    expect(missing.status).toBe(404);
    expect(notGenerated.status).toBe(409);
    expect(unlinked.status).toBe(409);
  });
});
