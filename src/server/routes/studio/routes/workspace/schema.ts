import { z } from "zod";

export const workspaceUpdateSchema = z.object({
  name: z.string().trim().min(1, "请输入工作区名称。").max(80, "工作区名称不能超过 80 个字符。"),
});

export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateSchema>;
