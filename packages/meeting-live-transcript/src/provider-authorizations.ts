import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@app/shared/meeting-transcription";
import { z } from "zod";

export const DEFAULT_DEEPGRAM_LIVE_MODEL = "nova-3";
export const DEFAULT_QWEN_LIVE_MODEL = "qwen-audio-3.0-asr-flash-streaming";
export const MAX_QWEN_LIVE_TOKEN_TTL_SECONDS = 1800;

const DEEPGRAM_AUTHORIZATION_ERROR_MESSAGES = new Map<number, string>([
  [401, "Deepgram API Key 无效，请在设置中重新填写"],
  [403, "Deepgram API Key 权限不足；临时 JWT 需要 Member 或更高权限"],
]);

export class MeetingLiveTranscriptProviderAuthorizationError extends Error {
  readonly provider: "deepgram" | "qwen";
  readonly status: number;

  constructor(input: { message: string; provider: "deepgram" | "qwen"; status: number }) {
    super(input.message);
    this.name = "MeetingLiveTranscriptProviderAuthorizationError";
    this.provider = input.provider;
    this.status = input.status;
  }
}

interface AuthorizationInput {
  captureId?: string;
  endpointingMs?: number;
  language?: string;
  speechNoiseThreshold?: number;
  track: MeetingLiveTranscriptTrack;
}

interface QwenAuthorizationDependencies {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  model: string;
  requestTimeoutMs?: number;
  tokenTtlSeconds?: number;
}

interface DeepgramAuthorizationDependencies {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  model?: string;
  requestTimeoutMs?: number;
  tokenTtlSeconds?: number;
}

const qwenTokenSchema = z
  .object({
    expires_at: z.number().int().positive(),
    token: z.string().min(1),
  })
  .passthrough();

const deepgramTokenSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
  })
  .passthrough();

/** Exchange a permanent DashScope key for a short-lived key before crossing a process boundary. */
export async function createQwenRealtimeTranscriptionAuthorization(
  input: AuthorizationInput,
  dependencies: QwenAuthorizationDependencies,
): Promise<MeetingLiveTranscriptAuthorization> {
  if (!dependencies.apiKey.trim()) {
    throw new Error("ALIBABA_API_KEY is not set for Meeting live transcription");
  }
  let origin: string;
  try {
    ({ origin } = new URL(dependencies.baseUrl));
  } catch {
    throw new Error("DashScope live transcription base URL is not a valid URL");
  }
  const requestedTtlSeconds = dependencies.tokenTtlSeconds;
  const ttlSeconds = Number.isFinite(requestedTtlSeconds)
    ? Math.min(
        Math.max(1, Math.trunc(requestedTtlSeconds ?? MAX_QWEN_LIVE_TOKEN_TTL_SECONDS)),
        MAX_QWEN_LIVE_TOKEN_TTL_SECONDS,
      )
    : MAX_QWEN_LIVE_TOKEN_TTL_SECONDS;
  const response = await (dependencies.fetch ?? globalThis.fetch)(
    `${origin}/api/v1/tokens?expire_in_seconds=${ttlSeconds}`,
    {
      headers: { Authorization: `Bearer ${dependencies.apiKey}` },
      method: "POST",
      signal: AbortSignal.timeout(dependencies.requestTimeoutMs ?? 10_000),
    },
  );
  if (!response.ok) {
    throw new MeetingLiveTranscriptProviderAuthorizationError({
      message: `DashScope live transcription authorization failed with HTTP ${response.status}`,
      provider: "qwen",
      status: response.status,
    });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("DashScope live transcription authorization returned a malformed response");
  }
  const parsed = qwenTokenSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("DashScope live transcription authorization returned a malformed response");
  }
  const { hostname } = new URL(origin);
  const authorization: MeetingLiveTranscriptAuthorization = {
    baseUrl: `wss://${hostname}/api-ws/v1/${dependencies.model.startsWith(DEFAULT_QWEN_LIVE_MODEL) ? "inference" : "realtime"}`,
    clientSecret: parsed.data.token,
    expiresAt: new Date(parsed.data.expires_at * 1000).toISOString(),
    language: input.language,
    model: dependencies.model,
    provider: "qwen",
    track: input.track,
  };
  if (input.speechNoiseThreshold !== undefined) {
    authorization.speechNoiseThreshold = input.speechNoiseThreshold;
  }
  return authorization;
}

/** Mint a short-lived Deepgram JWT so the permanent key never reaches the renderer. */
export async function createDeepgramRealtimeTranscriptionAuthorization(
  input: AuthorizationInput,
  dependencies: DeepgramAuthorizationDependencies,
): Promise<MeetingLiveTranscriptAuthorization> {
  if (!dependencies.apiKey.trim()) {
    throw new Error("Deepgram API Key is not configured");
  }
  const requestedTtlSeconds = dependencies.tokenTtlSeconds;
  const ttlSeconds = Number.isFinite(requestedTtlSeconds)
    ? Math.min(Math.max(1, Math.trunc(requestedTtlSeconds ?? 30)), 3600)
    : 30;
  const response = await (dependencies.fetch ?? globalThis.fetch)(
    "https://api.deepgram.com/v1/auth/grant",
    {
      body: JSON.stringify({ ttl_seconds: ttlSeconds }),
      headers: {
        Authorization: `Token ${dependencies.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(dependencies.requestTimeoutMs ?? 10_000),
    },
  );
  if (!response.ok) {
    const message =
      DEEPGRAM_AUTHORIZATION_ERROR_MESSAGES.get(response.status) ??
      `Deepgram 授权失败（HTTP ${response.status}）`;
    throw new MeetingLiveTranscriptProviderAuthorizationError({
      message,
      provider: "deepgram",
      status: response.status,
    });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Deepgram live transcription authorization returned a malformed response");
  }
  const parsed = deepgramTokenSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Deepgram live transcription authorization returned a malformed response");
  }
  const authorization: MeetingLiveTranscriptAuthorization = {
    baseUrl: "wss://api.deepgram.com/v1/listen",
    clientSecret: parsed.data.access_token,
    expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000).toISOString(),
    language: input.language ?? "zh-CN",
    model: dependencies.model ?? DEFAULT_DEEPGRAM_LIVE_MODEL,
    provider: "deepgram",
    track: input.track,
  };
  if (input.endpointingMs !== undefined) {
    authorization.endpointingMs = input.endpointingMs;
  }
  return authorization;
}
