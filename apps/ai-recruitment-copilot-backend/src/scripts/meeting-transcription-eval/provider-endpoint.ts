import type { MeetingTranscriptionProviderId } from "@arc/shared/meeting-transcription";
import { resolveMeetingTranscriptionProviderEndpoint } from "../../server/routes/meetings/transcription/provider-endpoint";

export function resolveMeetingTranscriptionBenchmarkEndpoint(input: {
  baseUrl: string;
  provider: Extract<MeetingTranscriptionProviderId, "deepgram" | "openai">;
}): { baseUrl: string; region: string } {
  const endpoint = resolveMeetingTranscriptionProviderEndpoint({
    ...input,
    allowUnverified: true,
  });
  return { baseUrl: endpoint.baseUrl, region: endpoint.region };
}
