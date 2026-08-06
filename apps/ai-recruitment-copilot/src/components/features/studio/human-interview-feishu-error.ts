import { isApiError } from "@/lib/client/api";

export interface CreatedMeetingFeishuFailure {
  meetingId: string;
  status: "failed" | "unknown";
}

export function getCreatedMeetingFeishuFailure(error: unknown): CreatedMeetingFeishuFailure | null {
  if (!isApiError(error) || error.status !== 502 || typeof error.payload !== "object") {
    return null;
  }
  const payload = error.payload as Record<string, unknown>;
  if (
    typeof payload.meetingId !== "string" ||
    (payload.feishuStatus !== "failed" && payload.feishuStatus !== "unknown")
  ) {
    return null;
  }
  return { meetingId: payload.meetingId, status: payload.feishuStatus };
}
