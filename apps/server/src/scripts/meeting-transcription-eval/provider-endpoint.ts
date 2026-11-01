import type { MeetingTranscriptionProviderId } from "@app/shared/meeting-transcription";
import { resolveMeetingTranscriptionProviderEndpoint } from "../../routes/meetings/transcription/provider-endpoint";

interface MeetingTranscriptionBenchmarkEndpoint {
  baseUrl: string;
  region: string;
}

export function resolveMeetingTranscriptionBenchmarkEndpoint(input: {
  baseUrl: string;
  provider: Extract<MeetingTranscriptionProviderId, "deepgram" | "openai">;
}): MeetingTranscriptionBenchmarkEndpoint {
  const endpoint = resolveMeetingTranscriptionProviderEndpoint({
    ...input,
    allowUnverified: true,
  });
  return { baseUrl: endpoint.baseUrl, region: endpoint.region };
}
