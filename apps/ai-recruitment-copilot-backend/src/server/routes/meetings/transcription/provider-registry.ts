import type {
  MeetingTranscriptionProviderCandidate,
  MeetingTranscriptionProviderId,
} from "@arc/shared/meeting-transcription";
import { resolveMeetingTranscriptionProviderEndpoint } from "./provider-endpoint";

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

export function listMeetingTranscriptionProviderCandidates(
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProviderCandidate[] {
  const candidates: MeetingTranscriptionProviderCandidate[] = [];
  if (enabled(env.MEETING_TRANSCRIPTION_DEEPGRAM_ENABLED)) {
    const endpoint = resolveMeetingTranscriptionProviderEndpoint({
      baseUrl: env.DEEPGRAM_BASE_URL?.trim() || "https://api.deepgram.com",
      provider: "deepgram",
    });
    candidates.push({
      id: "deepgram",
      label: "Deepgram Nova-3（候选）",
      model: env.MEETING_TRANSCRIPTION_DEEPGRAM_MODEL?.trim() || "nova-3",
      region: endpoint.region,
    });
  }
  if (enabled(env.MEETING_TRANSCRIPTION_OPENAI_ENABLED)) {
    const endpoint = resolveMeetingTranscriptionProviderEndpoint({
      baseUrl: env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      provider: "openai",
    });
    candidates.push({
      id: "openai",
      label: "OpenAI Diarized Transcription（候选）",
      model: env.MEETING_TRANSCRIPTION_OPENAI_MODEL?.trim() || "gpt-4o-transcribe-diarize",
      region: endpoint.region,
    });
  }
  return candidates;
}

export function findMeetingTranscriptionProviderCandidate(
  provider: MeetingTranscriptionProviderId,
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProviderCandidate | null {
  return (
    listMeetingTranscriptionProviderCandidates(env).find((item) => item.id === provider) ?? null
  );
}
