import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { platformRouter } from "../../../route";

const mocks = vi.hoisted(() => ({
  deleteCache: vi.fn(),
  getCacheJson: vi.fn(),
  queryCache: vi.fn(),
}));

vi.mock("../dao", () => ({
  deleteResumeParseCache: mocks.deleteCache,
  getResumeParseCacheJson: mocks.getCacheJson,
  queryPaginatedResumeParseCache: mocks.queryCache,
}));

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

describe("platform resume parse cache routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryCache.mockResolvedValue({
      page: 1,
      pageSize: 20,
      records: [],
      total: 0,
      totalPages: 1,
    });
  });

  it("keeps cache management behind the platform admin boundary", async () => {
    const response = await makeApp().request("/platform/resume-parse-cache");

    expect(response.status).toBe(401);
    expect(mocks.queryCache).not.toHaveBeenCalled();
  });

  it("passes list filters through the validated platform endpoint", async () => {
    const response = await makeApp("admin").request(
      "/platform/resume-parse-cache?page=2&pageSize=20&cacheType=structured&parsedStatus=ready&textSource=qwen-ocr&sortBy=filename&sortOrder=asc&search=resume",
    );

    expect(response.status).toBe(200);
    expect(mocks.queryCache).toHaveBeenCalledWith({
      cacheType: "structured",
      page: 2,
      pageSize: 20,
      parsedStatus: "ready",
      search: "resume",
      sortBy: "filename",
      sortOrder: "asc",
      textSource: "qwen-ocr",
    });
  });

  it("uses 10 rows as the default page size", async () => {
    const response = await makeApp("admin").request("/platform/resume-parse-cache");

    expect(response.status).toBe(200);
    expect(mocks.queryCache).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it("returns cache JSON and clears same-hash cache data", async () => {
    mocks.getCacheJson.mockResolvedValueOnce({ id: "cache_1", parsedStructured: { name: "张三" } });
    mocks.deleteCache.mockResolvedValueOnce({ clearedCount: 3 });

    const detail = await makeApp("admin").request("/platform/resume-parse-cache/cache_1");
    const deleted = await makeApp("admin").request("/platform/resume-parse-cache/cache_1", {
      method: "DELETE",
    });

    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toEqual({
      id: "cache_1",
      parsedStructured: { name: "张三" },
    });
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({ clearedCount: 3 });
    expect(mocks.deleteCache).toHaveBeenCalledWith("cache_1");
  });

  it("returns 404 for missing cache records", async () => {
    mocks.getCacheJson.mockResolvedValueOnce(null);
    mocks.deleteCache.mockResolvedValueOnce(null);

    const detail = await makeApp("admin").request("/platform/resume-parse-cache/missing");
    const deleted = await makeApp("admin").request("/platform/resume-parse-cache/missing", {
      method: "DELETE",
    });

    expect(detail.status).toBe(404);
    expect(deleted.status).toBe(404);
  });
});
