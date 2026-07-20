import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  deleteResumeParseCache,
  getResumeParseCacheJson,
  queryPaginatedResumeParseCache,
} from "./dao";
import { resumeParseCacheQuerySchema } from "./schema";

export const platformResumeParseCacheRouter = factory
  .createApp()
  .get(
    "/",
    zValidator("query", resumeParseCacheQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => c.json(await queryPaginatedResumeParseCache(c.req.valid("query")), 200),
  )
  .get("/:hash", async (c) => {
    const record = await getResumeParseCacheJson(c.req.param("hash"));
    return record ? c.json(record, 200) : c.json({ error: "解析缓存不存在" }, 404);
  })
  .delete("/:hash", async (c) => {
    const result = await deleteResumeParseCache(c.req.param("hash"));
    return result ? c.json(result, 200) : c.json({ error: "解析缓存不存在" }, 404);
  });
