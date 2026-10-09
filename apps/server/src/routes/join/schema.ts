import { z } from "zod";

export const codeParamsSchema = z.object({
  code: z.string().regex(/^[0-9A-Za-z]{16}$/u, "邀请码格式不正确。"),
});
