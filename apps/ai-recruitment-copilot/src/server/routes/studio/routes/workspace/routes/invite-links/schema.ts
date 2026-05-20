import { z } from "zod";

export const inviteLinkIdParamsSchema = z.object({
  id: z.string().min(1, "缺少链接 id。"),
});
