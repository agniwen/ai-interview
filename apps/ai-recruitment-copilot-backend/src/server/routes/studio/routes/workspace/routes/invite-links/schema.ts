import { z } from "zod";

export const inviteLinkIdParamsSchema = z.object({
  id: z.string().min(1, "缺少链接 id。"),
});

export const inviteLinkInitialRoleInputSchema = z.object({
  initialRole: z.string().trim().min(1, "请选择初始化角色。"),
});
