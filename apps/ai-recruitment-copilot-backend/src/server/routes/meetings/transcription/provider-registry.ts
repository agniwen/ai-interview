import type {
  MeetingTranscriptionProviderCandidate,
  MeetingTranscriptionProviderId,
} from "@arc/shared/meeting-transcription";

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

export function listMeetingTranscriptionProviderCandidates(
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProviderCandidate[] {
  const candidates: MeetingTranscriptionProviderCandidate[] = [];
  if (enabled(env.MEETING_TRANSCRIPTION_OPENAI_ENABLED)) {
    candidates.push({
      id: "openai",
      label: "OpenAI Diarized Transcription（候选）",
      model: env.MEETING_TRANSCRIPTION_OPENAI_MODEL?.trim() || "gpt-4o-transcribe-diarize",
      region: env.MEETING_TRANSCRIPTION_OPENAI_REGION?.trim() || "openai-default",
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
