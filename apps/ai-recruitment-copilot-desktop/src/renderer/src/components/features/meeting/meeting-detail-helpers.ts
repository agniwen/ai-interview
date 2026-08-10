import type { MeetingDetail, MeetingPlaybackAuthorization } from "@arc/shared/meeting-recording";

export function canRetryMeetingProcessing(role: MeetingDetail["accessRole"]): boolean {
  return role === "administrator" || role === "owner";
}

export function meetingDetailRefetchInterval(
  meeting: MeetingDetail | null | undefined,
): number | false {
  if (meeting?.processingState === "processing") {
    return 5000;
  }
  if (meeting?.processingState === "failed") {
    return 30_000;
  }
  return false;
}

export function playbackAuthorizationRefetchInterval(
  playback: MeetingPlaybackAuthorization | null | undefined,
  now = Date.now(),
): number | false {
  if (!playback) {
    return false;
  }
  const expiresAt = Date.parse(playback.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return 60_000;
  }
  return Math.max(1000, expiresAt - now - 60_000);
}
