import { z } from "zod";

const calendarInstantSchema = z.string().datetime({ offset: true });

export const studioCalendarQuerySchema = z
  .object({
    end: calendarInstantSchema,
    start: calendarInstantSchema,
  })
  .refine(({ end, start }) => new Date(start) < new Date(end), {
    message: "结束时间必须晚于开始时间。",
  })
  .refine(
    ({ end, start }) => new Date(end).getTime() - new Date(start).getTime() <= 370 * 86_400_000,
    {
      message: "单次查询范围不能超过 370 天。",
    },
  );

export const studioAiCalendarPreviewQuerySchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
});
