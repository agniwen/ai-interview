import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { platformRouter } from "../../../route";

const mocks = vi.hoisted(() => ({
  queryNotifications: vi.fn(),
  resendNotification: vi.fn(),
}));

vi.mock("../dao", () => ({
  platformNotificationProviderFilterValues: ["all", "feishu", "feishu_interview"] as const,
  platformNotificationStatusFilterValues: ["all", "pending", "sent", "failed"] as const,
  queryPaginatedPlatformNotifications: mocks.queryNotifications,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-interview-notifications",
  () => ({ resendInterviewSummaryNotification: mocks.resendNotification }),
);

function makeApp(role?: string) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      if (role) {
        c.set("user", { id: "user_1", role } as never);
      }
      await next();
    })
    .route("/platform", platformRouter);
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
});
