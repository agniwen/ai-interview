import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";
import { resolveMeetingTranscriptionQwenBaseUrl } from "../../transcription/provider-endpoint";
import {
  DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
  createQwenRealtimeTranscriptionAuthorization,
} from "../../transcription/providers/qwen-realtime";
import { liveTranscriptAuthorizationGate } from "./authorization-gate";
import {
  claimMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptTrackLease,
  renewMeetingLiveTranscriptLease,
} from "./dao";

function issueLiveTranscriptLeaseAuthorization(
  input: {
    captureId: string;
    organizationId: string;
    track: MeetingLiveTranscriptTrack;
    userId: string;
  },
  mint: () => Promise<MeetingLiveTranscriptAuthorization>,
): Promise<MeetingLiveTranscriptAuthorization | "capacity"> {
  return liveTranscriptAuthorizationGate.issue(input, async () => {
    const claim = await claimMeetingLiveTranscriptLease(input);
    if (claim === "capacity") {
      return "capacity";
    }
    try {
      return await mint();
    } catch (error) {
      if (claim === "created") {
        try {
          await releaseMeetingLiveTranscriptTrackLease(input);
        } catch {
          // The short track lease expires server-side if cleanup cannot be delivered.
        }
      }
      throw error;
    }
  });
}

export function createWorkspaceMeetingLiveTranscriptAuthorization(input: {
  captureId: string;
  organizationId: string;
  track: MeetingLiveTranscriptTrack;
  userId: string;
}): Promise<MeetingLiveTranscriptAuthorization | "capacity" | "unavailable"> {
  const qwenApiKey = process.env.ALIBABA_API_KEY?.trim();
  if (!qwenApiKey) {
    return Promise.resolve("unavailable");
  }
  return issueLiveTranscriptLeaseAuthorization(input, () =>
    createQwenRealtimeTranscriptionAuthorization(
      {
        captureId: input.captureId,
        language: process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_LANGUAGE?.trim() || undefined,
        track: input.track,
      },
      {
        apiKey: qwenApiKey,
        baseUrl: resolveMeetingTranscriptionQwenBaseUrl(),
        model:
          process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL?.trim() ||
          DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
        tokenTtlSeconds: Number.parseInt(
          process.env.MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS || "1800",
          10,
        ),
      },
    ),
  );
}

export function heartbeatWorkspaceMeetingLiveTranscript(input: {
  captureId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  return renewMeetingLiveTranscriptLease(input);
}

export function releaseWorkspaceMeetingLiveTranscript(input: {
  captureId: string;
  organizationId: string;
  userId: string;
}): Promise<void> {
  return releaseMeetingLiveTranscriptLease(input);
}
