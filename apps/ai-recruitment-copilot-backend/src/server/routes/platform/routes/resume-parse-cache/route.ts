import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  deleteResumeParseCache,
  getResumeParseCacheJson,
  queryPaginatedResumeParseCache,
} from "./dao";
import { resumeParseCacheQuerySchema } from "./schema";

export interface PlatformResumeParseCacheRouteDependencies {
  deleteCache: typeof deleteResumeParseCache;
  getCacheJson: typeof getResumeParseCacheJson;
  queryCache: typeof queryPaginatedResumeParseCache;
}

const defaultPlatformResumeParseCacheRouteDependencies: PlatformResumeParseCacheRouteDependencies =
  {
    deleteCache: deleteResumeParseCache,
    getCacheJson: getResumeParseCacheJson,
    queryCache: queryPaginatedResumeParseCache,
  };

export function createPlatformResumeParseCacheRouter(
  dependencies: PlatformResumeParseCacheRouteDependencies = defaultPlatformResumeParseCacheRouteDependencies,
) {
  return factory
    .createApp()
    .get(
      "/",
      zValidator("query", resumeParseCacheQuerySchema, jsonValidatorError("参数校验失败")),
      async (c) => c.json(await dependencies.queryCache(c.req.valid("query")), 200),
    )
    .get("/:hash", async (c) => {
      const record = await dependencies.getCacheJson(c.req.param("hash"));
      return record ? c.json(record, 200) : c.json({ error: "解析缓存不存在" }, 404);
    })
    .delete("/:hash", async (c) => {
      const result = await dependencies.deleteCache(c.req.param("hash"));
      return result ? c.json(result, 200) : c.json({ error: "解析缓存不存在" }, 404);
    });
}

export const platformResumeParseCacheRouter = createPlatformResumeParseCacheRouter();
