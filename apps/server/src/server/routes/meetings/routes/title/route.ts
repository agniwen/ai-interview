import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { generateRecordingTitle } from "./generator";

const recordingTitleRequestSchema = z.object({
  transcript: z.string().trim().min(12).max(6000),
});

export const meetingTitleRouter = factory
  .createApp()
  .post(
    "/",
    zValidator("json", recordingTitleRequestSchema, jsonValidatorError("实时转写内容无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const title = await generateRecordingTitle(c.req.valid("json").transcript);
        return c.json({ title }, 200);
      } catch {
        return c.json({ error: "暂时无法生成录制标题" }, 503);
      }
    },
  );
