import { createHash } from "node:crypto";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";
import { loadMeetingTranscriptionPolicy } from "../../transcription/dao";
import { listMeetingTranscriptionProviderCandidates } from "../../transcription/provider-registry";
import { createOpenAiRealtimeTranscriptionAuthorization } from "../../transcription/providers/openai-realtime";
import { liveTranscriptAuthorizationGate } from "./authorization-gate";

export async function createWorkspaceMeetingLiveTranscriptAuthorization(input: {
  captureId: string;
  organizationId: string;
  track: MeetingLiveTranscriptTrack;
  userId: string;
}): Promise<MeetingLiveTranscriptAuthorization | "unavailable"> {
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
  return liveTranscriptAuthorizationGate.issue(input, () => {
    const safetyIdentifier = createHash("sha256")
      .update(`${input.organizationId}:${input.userId}`)
      .digest("hex");
    return createOpenAiRealtimeTranscriptionAuthorization(
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
  });
}
