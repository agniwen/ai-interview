import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type { StudioCalendarRouterDependencies } from "./route";
import { createStudioCalendarRouter } from "./route";

const mocks = {
  listStudioCalendarEvents: vi.fn(),
  loadAiCalendarEventPreview: vi.fn(),
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  permissionChecks: [] as [string, string][],
  resolveRecruitingVisibilityScope: vi.fn(),
};

const dependencies = {
  listEvents: mocks.listStudioCalendarEvents,
  loadPreview: mocks.loadAiCalendarEventPreview,
  requirePermission:
    (resource: string, action: string) =>
    (
      _c: { set: (key: string, value: { id?: string; role?: string }) => void },
      next: () => Promise<void>,
    ) => {
      mocks.permissionChecks.push([resource, action]);
      return next();
    },
  resolveVisibility: mocks.resolveRecruitingVisibilityScope,
} satisfies StudioCalendarRouterDependencies;

const studioCalendarRouter = createStudioCalendarRouter(dependencies);

const ORGANIZATION_ID = "org-calendar";
const USER_ID = "user-calendar";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORGANIZATION_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "hr" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/calendar", studioCalendarRouter);
}

describe("studioCalendarRouter AI event preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissionChecks.length = 0;
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({
      kind: "restricted",
      userIds: [USER_ID],
    });
  });

  it("returns a lightweight preview for one visible AI interview result", async () => {
    const preview = {
      candidate: {
        id: "candidate-1",
        jobDescriptionName: "前端工程师",
        name: "张三",
        targetRole: "高级前端工程师",
      },
      result: {
        conversationId: "conversation-1",
        durationSecs: 2520,
        endedAt: "2026-07-26T02:42:00.000Z",
        reportStatus: "ready",
        startedAt: "2026-07-26T02:00:00.000Z",
        summary: "候选人熟悉 React 和 TypeScript。",
        turnCount: 28,
      },
      round: {
        allowTextInput: true,
        disconnectedAt: null,
        id: "round-1",
        label: "技术初筛",
        scheduledAt: "2026-07-26T02:00:00.000Z",
        scheduledEndAt: "2026-07-26T03:00:00.000Z",
        sessionStartedAt: "2026-07-26T02:00:00.000Z",
        status: "completed",
      },
    };
    mocks.loadAiCalendarEventPreview.mockResolvedValue(preview);

    const response = await makeApp().request(
      "/calendar/ai-events/round-1/preview?conversationId=conversation-1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(preview);
    expect(mocks.permissionChecks).toContainEqual(["interview", "read"]);
    expect(mocks.loadAiCalendarEventPreview).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      organizationId: ORGANIZATION_ID,
      roundId: "round-1",
      visibilityScope: { kind: "restricted", userIds: [USER_ID] },
    });
  });

  it("returns not-found when the AI event is outside the member visibility scope", async () => {
    mocks.loadAiCalendarEventPreview.mockResolvedValue(null);

    const response = await makeApp().request("/calendar/ai-events/hidden-round/preview");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "AI 面试事件不存在。" });
  });
});
