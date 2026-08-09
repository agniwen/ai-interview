import { z } from "zod";
import type { ClientSecretCreateParams } from "openai/resources/realtime/client-secrets";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";

const openAiClientSecretSchema = z
  .object({
    expires_at: z.number().int().positive(),
    value: z.string().min(1),
  })
  .passthrough();

interface OpenAiRealtimeAuthorizationInput {
  captureId: string;
  safetyIdentifier: string;
  track: MeetingLiveTranscriptTrack;
}

interface OpenAiRealtimeAuthorizationDependencies {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  model: string;
  requestTimeoutMs?: number;
}

export async function createOpenAiRealtimeTranscriptionAuthorization(
  input: OpenAiRealtimeAuthorizationInput,
  dependencies: OpenAiRealtimeAuthorizationDependencies,
): Promise<MeetingLiveTranscriptAuthorization> {
  if (!dependencies.apiKey.trim()) {
    throw new Error("OPENAI_API_KEY is not set for Meeting live transcription");
  }
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const baseUrl = dependencies.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1";
  const requestBody = {
    expires_after: { anchor: "created_at", seconds: 30 },
    session: {
      audio: {
        input: {
          format: { rate: 24_000, type: "audio/pcm" },
          // Meetings may mix Mandarin, Cantonese, and English, so do not force one language.
          transcription: { model: dependencies.model },
          turn_detection: { type: "server_vad" },
        },
      },
      type: "transcription",
    },
  } satisfies ClientSecretCreateParams;
  const response = await fetch(`${baseUrl}/realtime/client_secrets`, {
    body: JSON.stringify(requestBody),
    headers: {
      Authorization: `Bearer ${dependencies.apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": input.safetyIdentifier,
    },
    method: "POST",
    signal: AbortSignal.timeout(dependencies.requestTimeoutMs ?? 10_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI realtime authorization failed with HTTP ${response.status}`);
  }
  const secret = openAiClientSecretSchema.parse(await response.json());
  return {
    clientSecret: secret.value,
    expiresAt: new Date(secret.expires_at * 1000).toISOString(),
    model: dependencies.model,
    provider: "openai",
    track: input.track,
  };
}
