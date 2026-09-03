import { z } from "zod";

export const inviteLinkIdParamsSchema = z.object({
  id: z.string().min(1, "缺少链接 id。"),
});

export const inviteLinkInitialRoleInputSchema = z.object({
  initialRole: z.string().trim().min(1, "请选择初始化角色。"),
});

export const inviteLinkCreateInputSchema = inviteLinkInitialRoleInputSchema.extend({
  email: z.string().trim().toLowerCase().email("请输入有效邮箱。").max(200).optional(),
});
