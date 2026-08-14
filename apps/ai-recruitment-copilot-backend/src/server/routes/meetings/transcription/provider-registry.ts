import type {
  MeetingTranscriptionProviderCandidate,
  MeetingTranscriptionProviderId,
} from "@arc/shared/meeting-transcription";
import {
  resolveMeetingTranscriptionProviderEndpoint,
  resolveMeetingTranscriptionQwenBaseUrl,
} from "./provider-endpoint";

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

export function listMeetingTranscriptionProviderCandidates(
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProviderCandidate[] {
  if (!enabled(env.MEETING_TRANSCRIPTION_QWEN_ENABLED)) {
    return [];
  }
  const endpoint = resolveMeetingTranscriptionProviderEndpoint({
    baseUrl: resolveMeetingTranscriptionQwenBaseUrl(env),
    provider: "qwen",
  });
  return [
    {
      id: "qwen",
      label: "通义千问 ASR（百炼 Qwen3-ASR-Flash）",
      model: env.MEETING_TRANSCRIPTION_QWEN_MODEL?.trim() || "qwen3-asr-flash-filetrans",
      region: endpoint.region,
    },
  ];
}

export function findMeetingTranscriptionProviderCandidate(
  provider: MeetingTranscriptionProviderId,
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProviderCandidate | null {
  return (
    listMeetingTranscriptionProviderCandidates(env).find((item) => item.id === provider) ?? null
  );
}
