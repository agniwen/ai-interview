import type { MeetingTranscriptionProviderId } from "@arc/shared/meeting-transcription";

const KNOWN_ENDPOINTS: Record<string, string> = {
  "deepgram:https://api.au.deepgram.com": "deepgram-au",
  "deepgram:https://api.deepgram.com": "deepgram-us",
  "deepgram:https://api.eu.deepgram.com": "deepgram-eu",
  "openai:https://api.openai.com/v1": "openai-default",
};

export function resolveMeetingTranscriptionProviderEndpoint(input: {
  allowUnverified?: boolean;
  baseUrl: string;
  provider: Extract<MeetingTranscriptionProviderId, "deepgram" | "openai">;
}): { baseUrl: string; region: string; verified: boolean } {
  const url = new URL(input.baseUrl);
  if (url.protocol !== "https:") {
    throw new Error(`${input.provider} transcription endpoint must use HTTPS`);
  }
  const normalized = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  const region = KNOWN_ENDPOINTS[`${input.provider}:${normalized}`];
  if (!region && !input.allowUnverified) {
    throw new Error(`${input.provider} production endpoint is not in the verified region map`);
  }
  return {
    baseUrl: normalized,
    region: region ?? `${input.provider}-custom-unverified`,
    verified: Boolean(region),
  };
}

export function assertMeetingTranscriptionJobEndpoint(input: {
  baseUrl: string;
  provider: Extract<MeetingTranscriptionProviderId, "deepgram" | "openai">;
  region: string;
}): string {
  const endpoint = resolveMeetingTranscriptionProviderEndpoint(input);
  if (endpoint.region !== input.region) {
    throw new Error(
      `${input.provider} job region ${input.region} does not match worker endpoint ${endpoint.region}`,
    );
  }
  return endpoint.baseUrl;
}
