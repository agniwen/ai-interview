import { z } from "zod";

export const workspaceUpdateSchema = z.object({
  name: z.string().trim().min(1, "请输入工作区名称。").max(80, "工作区名称不能超过 80 个字符。"),
});

export const recruitingGroupInputSchema = z.object({
  name: z.string().trim().min(1, "请输入组别名称。").max(40, "组别名称不能超过 40 个字符。"),
});

export const memberRecruitingGroupInputSchema = z.object({
  groupId: z.string().trim().min(1).nullable(),
});

export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateSchema>;
