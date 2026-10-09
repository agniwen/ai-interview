import { backgroundCheckDraftInputSchema } from "@app/db-schema/background-check";
import type { BackgroundCheckDraftInput } from "@app/db-schema/background-check";
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "../../../../factory";

export function createBackgroundCheckDraftRouter(dependencies: {
  saveDraft: (
    token: string,
    input: BackgroundCheckDraftInput,
  ) => Promise<{ savedAt: string } | null>;
}) {
  return factory
    .createApp()
    .post(
      "/:token/draft",
      zValidator(
        "json",
        backgroundCheckDraftInputSchema,
        jsonValidatorError("草稿内容无效，请检查后重试。"),
      ),
      async (c) => {
        c.header("Cache-Control", "no-store");
        const result = await dependencies.saveDraft(c.req.param("token"), c.req.valid("json"));
        if (!result) {
          return c.json({ error: "当前背调链接已提交或不可用，无法保存草稿。" }, 409);
        }
        return c.json(result, 200);
      },
    );
}
