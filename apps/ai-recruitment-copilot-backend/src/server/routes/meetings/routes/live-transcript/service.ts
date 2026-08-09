import { createHash } from "node:crypto";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";
import { loadMeetingTranscriptionPolicy } from "../../transcription/dao";
import { listMeetingTranscriptionProviderCandidates } from "../../transcription/provider-registry";
import { createOpenAiRealtimeTranscriptionAuthorization } from "../../transcription/providers/openai-realtime";
import { liveTranscriptAuthorizationGate } from "./authorization-gate";
import {
  claimMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptTrackLease,
  renewMeetingLiveTranscriptLease,
} from "./dao";

export async function createWorkspaceMeetingLiveTranscriptAuthorization(input: {
  captureId: string;
  organizationId: string;
  track: MeetingLiveTranscriptTrack;
  userId: string;
}): Promise<MeetingLiveTranscriptAuthorization | "capacity" | "unavailable"> {
  const policy = await loadMeetingTranscriptionPolicy(input.organizationId);
  const providers = listMeetingTranscriptionProviderCandidates();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (
    policy.selectedProvider !== "openai" ||
    !policy.allowedProviders.includes("openai") ||
    !providers.some((provider) => provider.id === "openai") ||
    !apiKey
  ) {
    return "unavailable";
  }
  return liveTranscriptAuthorizationGate.issue(input, async () => {
    const claim = await claimMeetingLiveTranscriptLease(input);
    if (claim === "capacity") {
      return "capacity";
    }
    try {
      const safetyIdentifier = createHash("sha256")
        .update(`${input.organizationId}:${input.userId}`)
        .digest("hex");
      return await createOpenAiRealtimeTranscriptionAuthorization(
        {
          captureId: input.captureId,
          safetyIdentifier,
          track: input.track,
        },
        {
          apiKey,
          model:
            process.env.MEETING_TRANSCRIPTION_OPENAI_LIVE_MODEL?.trim() || "gpt-4o-mini-transcribe",
        },
      );
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
