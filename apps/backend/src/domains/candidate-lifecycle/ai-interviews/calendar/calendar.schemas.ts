import {
  humanInterviewFormatSchema,
  humanInterviewMeetingStatusSchema,
  scheduleEntryStatusSchema,
} from "@arc/db-schema/studio-interviews";
import { interviewSummaryStatusSchema } from "@arc/db-schema/db-enums";
import { z } from "zod";

const instantSchema = z.iso.datetime({ offset: true });
export const calendarWorkspacePathSchema = z.object({ slug: z.string().trim().min(1) });
export const calendarPreviewPathSchema = calendarWorkspacePathSchema.extend({
  roundId: z.string().trim().min(1),
});
export const calendarQuerySchema = z
  .object({ end: instantSchema, start: instantSchema })
  .refine(({ end, start }) => new Date(start) < new Date(end), "结束时间必须晚于开始时间。")
  .refine(
    ({ end, start }) => new Date(end).getTime() - new Date(start).getTime() <= 370 * 86_400_000,
    "单次查询范围不能超过 370 天。",
  );
export const calendarPreviewQuerySchema = z.object({
  conversationId: z.string().trim().min(1).optional(),
});
const candidateSchema = z.object({
  candidateName: z.string(),
  interviewRecordId: z.string(),
  roundId: z.string(),
  roundLabel: z.string(),
});
const baseEventSchema = z.object({
  candidates: z.array(candidateSchema),
  endAt: z.iso.datetime(),
  id: z.string(),
  startAt: z.iso.datetime(),
  status: z.enum(["scheduled", "in_progress", "ended"]),
  title: z.string(),
});
const aiEventSchema = baseEventSchema.extend({
  conversationId: z.string().nullable(),
  kind: z.literal("ai"),
  source: z.enum(["result", "scheduled"]),
});
const humanEventSchema = baseEventSchema.extend({
  format: humanInterviewFormatSchema,
  interviewers: z.array(z.object({ id: z.string(), name: z.string() })),
  kind: z.literal("human"),
  location: z.string().nullable(),
  meetingUrl: z.string().nullable(),
  status: humanInterviewMeetingStatusSchema.exclude(["cancelled"]),
});
export const calendarResponseSchema = z.object({
  events: z.array(z.union([aiEventSchema, humanEventSchema])),
});
export const calendarPreviewResponseSchema = z.object({
  candidate: z.object({
    id: z.string(),
    jobDescriptionName: z.string().nullable(),
    name: z.string(),
    targetRole: z.string().nullable(),
  }),
  result: z
    .object({
      conversationId: z.string(),
      durationSecs: z.number().int().nonnegative().nullable(),
      endedAt: z.iso.datetime().nullable(),
      reportStatus: interviewSummaryStatusSchema,
      startedAt: z.iso.datetime().nullable(),
      summary: z.string().nullable(),
      turnCount: z.number().int().nonnegative(),
    })
    .nullable(),
  round: z.object({
    allowTextInput: z.boolean(),
    disconnectedAt: z.iso.datetime().nullable(),
    id: z.string(),
    label: z.string(),
    scheduledAt: z.iso.datetime().nullable(),
    scheduledEndAt: z.iso.datetime().nullable(),
    sessionStartedAt: z.iso.datetime().nullable(),
    status: scheduleEntryStatusSchema,
  }),
});
