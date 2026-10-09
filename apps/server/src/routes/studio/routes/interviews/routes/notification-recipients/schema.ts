import { z } from "zod";

export const replaceInterviewNotificationRecipientsSchema = z.object({
  userIds: z
    .array(z.string().trim().min(1))
    .max(20, "通知人员最多选择 20 人。")
    .refine((values) => new Set(values).size === values.length, "通知人员不能重复。"),
});
