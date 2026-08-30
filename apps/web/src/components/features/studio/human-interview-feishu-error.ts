import { ApiError } from "@/lib/client/api";
import { z } from "zod";

export interface CreatedMeetingFeishuFailure {
  meetingId: string;
  status: "failed" | "unknown";
}

const createdMeetingFeishuFailureSchema = z.object({
  feishuStatus: z.enum(["failed", "unknown"]),
  meetingId: z.string(),
});

export function getCreatedMeetingFeishuFailure(error: Error): CreatedMeetingFeishuFailure | null {
  if (!(error instanceof ApiError) || error.status !== 502) {
    return null;
  }
  const payload = createdMeetingFeishuFailureSchema.safeParse(error.payload);
  if (!payload.success) {
    return null;
  }
  return { meetingId: payload.data.meetingId, status: payload.data.feishuStatus };
}
