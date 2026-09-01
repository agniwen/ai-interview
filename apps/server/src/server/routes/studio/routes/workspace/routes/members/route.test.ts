import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../../../factory";
import { createWorkspaceMembersRouter } from "./route";

const dependencies = {
  feishuHumanInterviewEnabled: vi.fn(() => true),
  listOptions: vi.fn(),
  queryMembers: vi.fn(),
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: The route only reads the workspace id from this test context.
      c.set("activeOrg", { id: "org-1" } as never);
      await next();
    })
    .route("/members", createWorkspaceMembersRouter(dependencies));
}

describe("workspace members routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.queryMembers.mockResolvedValue({
      page: 1,
      pageSize: 10,
      records: [],
      total: 0,
      totalPages: 0,
    });
    dependencies.listOptions.mockResolvedValue([]);
  });

  it("lists the first page by join time from newest to oldest by default", async () => {
    const response = await makeApp().request("/members");

    expect(response.status).toBe(200);
    expect(dependencies.queryMembers).toHaveBeenCalledWith("org-1", {
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      textFilters: undefined,
    });
  });

  it("passes last-active sorting and pagination to the member query", async () => {
    const response = await makeApp().request(
      '/members?page=3&pageSize=20&sortBy=lastActiveAt&sortOrder=asc&textFilters={"name":"张"}',
    );

    expect(response.status).toBe(200);
    expect(dependencies.queryMembers).toHaveBeenCalledWith("org-1", {
      page: 3,
      pageSize: 20,
      sortBy: "lastActiveAt",
      sortOrder: "asc",
      textFilters: '{"name":"张"}',
    });
  });

  it("keeps the complete member options endpoint for pickers", async () => {
    dependencies.listOptions.mockResolvedValueOnce([{ id: "user-1" }]);

    const response = await makeApp().request("/members/options");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      feishuHumanInterviewEnabled: true,
      records: [{ id: "user-1" }],
    });
    expect(dependencies.listOptions).toHaveBeenCalledWith("org-1");
  });
});
