import type {
  MeetingTranscriptionProviderCandidate,
  MeetingTranscriptionProviderId,
} from "@app/shared/meeting-transcription";
import {
  resolveMeetingTranscriptionProviderEndpoint,
  resolveMeetingTranscriptionQwenBaseUrl,
} from "./meeting-transcription-provider-endpoint";

export function listMeetingTranscriptionProviderCandidates(
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProviderCandidate[] {
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

export function resolveMeetingTranscriptionProviderModel(
  candidate: MeetingTranscriptionProviderCandidate,
  assets: { status: string; track: string }[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const hasReadyDiarizableAudio = assets.some(
    (asset) => asset.status === "ready" && (asset.track === "mixed" || asset.track === "system"),
  );
  if (candidate.id === "qwen" && hasReadyDiarizableAudio) {
    return (
      env.MEETING_TRANSCRIPTION_QWEN_MIXED_MODEL?.trim() || "qwen-audio-3.0-asr-flash-filetrans"
    );
  }
  return candidate.model;
}
