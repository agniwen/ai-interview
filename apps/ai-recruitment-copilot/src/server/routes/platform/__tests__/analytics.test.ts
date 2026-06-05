import { describe, expect, it, vi } from "vitest";
import { normalizePlatformAnalyticsRangeDays } from "@/lib/shared/platform-analytics";
import { loadPlatformAnalyticsSummary } from "@/server/routes/platform/analytics";
import type { PostHogAnalyticsConfig } from "@/server/routes/platform/analytics";

const config: PostHogAnalyticsConfig = {
  apiHost: "https://us.posthog.com",
  personalApiKey: "phx_test",
  projectId: "123",
};

const directory = {
  users: {
    user_1: {
      email: "user1@example.com",
      id: "user_1",
      image: "https://example.com/avatar.png",
      name: "测试用户",
    },
  },
  workspaces: {
    org_1: {
      id: "org_1",
      name: "测试工作区",
      slug: "test-workspace",
    },
  },
};

function jsonResponse(body: unknown) {
  return Response.json(body);
}

describe("platform analytics PostHog summary", () => {
  it("defaults analytics range to the last 7 days", () => {
    expect(normalizePlatformAnalyticsRangeDays(null)).toBe(7);
  });

  it("returns an unconfigured summary without calling PostHog when config is missing", async () => {
    const fetchImpl = vi.fn();

    const result = await loadPlatformAnalyticsSummary({
      config: null,
      fetchImpl,
      rangeDays: 30,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.configured).toBe(false);
    expect(result.directory).toEqual({ users: {}, workspaces: {} });
    expect(result.error).toBe(null);
    expect(result.totals.totalEvents).toBe(0);
    expect(result.dailyTrend).toEqual([]);
    expect(result.activityEvents).toEqual([]);
  });

  it("returns an empty configured summary when PostHog is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await loadPlatformAnalyticsSummary({
      config,
      fetchImpl,
      rangeDays: 30,
      userId: "user_1",
      workspaceId: "org_1",
    });

    expect(result.configured).toBe(true);
    expect(result.directory).toEqual({ users: {}, workspaces: {} });
    expect(result.error).toBe("fetch failed");
    expect(result.totals.totalEvents).toBe(0);
    expect(result.filters).toEqual({
      rangeDays: 30,
      userId: "user_1",
      workspaceId: "org_1",
    });
  });

  it("maps blocking HogQL query results into dashboard metrics", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [[42, 3, 2, 12, 7, 5, 4]],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            [
              "event_uuid_1",
              "2026-06-05T08:00:00.000Z",
              "page_viewed",
              "user_1",
              "org_1",
              "/w/[workspace]/studio/resumes",
              "studio_resumes",
              "success",
              "client",
              "pdf",
              2048,
              321,
            ],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            ["2026-06-04", 10, 4, 2, 1],
            ["2026-06-05", 32, 8, 5, 3],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            ["page_viewed", 12],
            ["resume_parse_completed", 7],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [["/w/[workspace]/studio/resumes", "studio_resumes", 9]],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [["org_1", 20, 2]],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [["user_1", 18, 1]],
        }),
      );

    const result = await loadPlatformAnalyticsSummary({
      config,
      directory,
      fetchImpl,
      rangeDays: 30,
      userId: "user_1",
      workspaceId: "org_1",
    });

    expect(result.configured).toBe(true);
    expect(result.directory).toEqual(directory);
    expect(result.error).toBe(null);
    expect(result.totals).toEqual({
      activeUsers: 3,
      activeWorkspaces: 2,
      interviewsCreated: 4,
      pageViews: 12,
      resumesParsed: 7,
      resumesUploaded: 5,
      totalEvents: 42,
    });
    expect(result.dailyTrend).toHaveLength(2);
    expect(result.activityEvents[0]).toEqual({
      event: "page_viewed",
      id: "event_uuid_1",
      pageKey: "studio_resumes",
      pagePath: "/w/[workspace]/studio/resumes",
      properties: {
        durationMs: 321,
        fileSize: 2048,
        fileType: "pdf",
        source: "client",
        status: "success",
      },
      timestamp: "2026-06-05T08:00:00.000Z",
      user: {
        email: "user1@example.com",
        id: "user_1",
        image: "https://example.com/avatar.png",
        name: "测试用户",
      },
      userId: "user_1",
      workspace: {
        id: "org_1",
        name: "测试工作区",
        slug: "test-workspace",
      },
      workspaceId: "org_1",
    });
    expect(result.eventBreakdown[0]).toEqual({ count: 12, event: "page_viewed" });
    expect(result.topPages[0]).toEqual({
      pageKey: "studio_resumes",
      pagePath: "/w/[workspace]/studio/resumes",
      views: 9,
    });
    expect(result.topWorkspaces[0]).toEqual({
      activeUsers: 2,
      eventCount: 20,
      workspaceId: "org_1",
    });
    expect(result.topUsers[0]).toEqual({
      activeWorkspaces: 1,
      eventCount: 18,
      userId: "user_1",
    });

    const firstRequest = fetchImpl.mock.calls[0]?.[0] as string;
    const firstInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(firstRequest).toBe("https://us.posthog.com/api/projects/123/query/");
    expect(firstInit.headers).toMatchObject({
      Authorization: "Bearer phx_test",
      "Content-Type": "application/json",
    });
    expect(String(firstInit.body)).toContain("properties.workspace_id = 'org_1'");
    expect(String(firstInit.body)).toContain("properties.user_id = 'user_1'");
    expect(String(firstInit.body)).toContain("properties.workspace_id IS NOT NULL");
    expect(String(firstInit.body)).toContain("properties.user_id IS NOT NULL");
  });

  it("uses PostHog limit and offset for activity pagination", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [[42, 3, 2, 12, 7, 5, 4]],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [],
        }),
      );

    const result = await loadPlatformAnalyticsSummary({
      config,
      fetchImpl,
      page: 3,
      pageSize: 20,
      rangeDays: 7,
    });

    const activityInit = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(String(activityInit.body)).toContain("LIMIT 20");
    expect(String(activityInit.body)).toContain("OFFSET 40");
    expect(result.activityPagination).toEqual({
      page: 3,
      pageSize: 20,
      total: 42,
      totalPages: 3,
    });
  });
});
