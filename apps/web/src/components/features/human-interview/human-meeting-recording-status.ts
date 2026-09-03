import type { HumanInterviewRecordingStatus } from "@app/db-schema/studio-interviews";
import type { HumanInterviewMeetingTokenResponse } from "@app/shared/studio-pipeline-stages";

export function shouldPollHumanInterviewRecordingStatus(
  token: HumanInterviewMeetingTokenResponse | null,
  status: HumanInterviewRecordingStatus,
): boolean {
  return Boolean(token) && status !== "completed";
}

export function getHumanInterviewRecordingPollDelayMs(
  status: HumanInterviewRecordingStatus,
  failedAttempts: number,
): number {
  if (status !== "failed") {
    return 2000;
  }
  return Math.min(30_000, 4000 * 2 ** Math.max(0, failedAttempts));
}
