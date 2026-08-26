import { z } from "zod";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";

export const DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL = "qwen-audio-3.0-asr-flash-streaming";
export const MAX_MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS = 1800;

/**
 * DashScope 临时 API Key 响应。临时 Key 继承永久 Key 的全部权限，固定生命周期到期后自动失效。
 * DashScope temp-token response; the temp key inherits the parent key's permissions and self-expires.
 */
const tempTokenSchema = z
  .object({
    expires_at: z.number().int().positive(),
    token: z.string().min(1),
  })
  .passthrough();

interface QwenRealtimeAuthorizationInput {
  captureId: string;
  language?: string;
  track: MeetingLiveTranscriptTrack;
}

interface QwenRealtimeAuthorizationDependencies {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  model: string;
  requestTimeoutMs?: number;
  tokenTtlSeconds?: number;
}

/**
 * 用永久 ALIBABA_API_KEY 换取短期临时 Key，避免长期凭证进入 Desktop。
 * Mints a short-lived DashScope temp token so the permanent ALIBABA_API_KEY never reaches Desktop.
 */
export async function createQwenRealtimeTranscriptionAuthorization(
  input: QwenRealtimeAuthorizationInput,
  dependencies: QwenRealtimeAuthorizationDependencies,
): Promise<MeetingLiveTranscriptAuthorization> {
  if (!dependencies.apiKey.trim()) {
    throw new Error("ALIBABA_API_KEY is not set for Meeting live transcription");
  }
  const fetch = dependencies.fetch ?? globalThis.fetch;
  let origin: string;
  try {
    ({ origin } = new URL(dependencies.baseUrl));
  } catch {
    throw new Error("DashScope live transcription base URL is not a valid URL");
  }
  const requestedTtlSeconds = dependencies.tokenTtlSeconds;
  const ttlSeconds = Number.isFinite(requestedTtlSeconds)
    ? Math.min(
        Math.max(1, Math.trunc(requestedTtlSeconds ?? 1800)),
        MAX_MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS,
      )
    : 1800;
  const response = await fetch(`${origin}/api/v1/tokens?expire_in_seconds=${ttlSeconds}`, {
    headers: { Authorization: `Bearer ${dependencies.apiKey}` },
    method: "POST",
    signal: AbortSignal.timeout(dependencies.requestTimeoutMs ?? 10_000),
  });
  if (!response.ok) {
    throw new Error(
      `DashScope live transcription authorization failed with HTTP ${response.status}`,
    );
  }
  let parsed: z.infer<typeof tempTokenSchema>;
  try {
    parsed = tempTokenSchema.parse(await response.json());
  } catch {
    throw new Error("DashScope live transcription authorization returned a malformed response");
  }
  let hostname: string;
  try {
    ({ hostname } = new URL(origin));
  } catch {
    throw new Error("DashScope live transcription base URL is not a valid URL");
  }
  return {
    baseUrl: `wss://${hostname}/api-ws/v1/${dependencies.model.startsWith("qwen-audio-3.0-asr-flash-streaming") ? "inference" : "realtime"}`,
    clientSecret: parsed.token,
    expiresAt: new Date(parsed.expires_at * 1000).toISOString(),
    language: input.language,
    model: dependencies.model,
    provider: "qwen",
    track: input.track,
  };
}
