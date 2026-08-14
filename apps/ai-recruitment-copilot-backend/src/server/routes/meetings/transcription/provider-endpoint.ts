import type { MeetingTranscriptionProviderId } from "@arc/shared/meeting-transcription";

const KNOWN_ENDPOINTS: Record<string, string> = {
  "deepgram:https://api.au.deepgram.com": "deepgram-au",
  "deepgram:https://api.deepgram.com": "deepgram-us",
  "deepgram:https://api.eu.deepgram.com": "deepgram-eu",
  "openai:https://api.openai.com/v1": "openai-default",
  "qwen:https://dashscope-intl.aliyuncs.com": "qwen-singapore",
  "qwen:https://dashscope.aliyuncs.com": "qwen-cn-beijing",
};

/**
 * 百炼 ASR 的 REST API 挂在站点根路径下（/api/v1/services/audio/asr/transcription），
 * 而 ALIBABA_BASE_URL 通常带 LLM 用的 compatible-mode/v1 路径，必须剥到 origin。
 * DashScope ASR endpoints live under the site origin; strip any LLM base path first.
 */
export function resolveMeetingTranscriptionQwenBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw =
    env.MEETING_TRANSCRIPTION_QWEN_BASE_URL?.trim() ||
    env.ALIBABA_BASE_URL?.trim() ||
    "https://dashscope.aliyuncs.com";
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error("Meeting transcription Qwen base URL is not a valid URL");
  }
}

export function resolveMeetingTranscriptionProviderEndpoint(input: {
  allowUnverified?: boolean;
  baseUrl: string;
  provider: Extract<MeetingTranscriptionProviderId, "deepgram" | "openai" | "qwen">;
}): { baseUrl: string; region: string; verified: boolean } {
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error(`${input.provider} transcription endpoint must be a valid URL`);
  }
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
  provider: Extract<MeetingTranscriptionProviderId, "deepgram" | "openai" | "qwen">;
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
