import type { MinimaxVoiceId } from "@arc/db-schema/minimax-voices";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { putObjectBytes } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { minimaxVoicePreview } from "@arc/db-schema/schema";

export const MINIMAX_VOICE_PREVIEW_TEXT = "我是一名宇航员，我的故乡是地球。";
export const MINIMAX_VOICE_PREVIEW_MODEL = "speech-02-turbo";
export const MINIMAX_VOICE_PREVIEW_FORMAT = "mp3";
const MINIMAX_VOICE_PREVIEW_CONTENT_TYPE = "audio/mpeg";

interface VoicePreviewIdentity {
  format: string;
  model: string;
  previewText: string;
  previewTextHash: string;
  voice: MinimaxVoiceId;
}

interface VoicePreviewRecord extends VoicePreviewIdentity {
  contentType: string;
  createdAt: string | Date;
  id: string;
  publicUrl: string;
  sizeBytes: number;
  storageKey: string;
  updatedAt: string | Date;
}

interface NewVoicePreviewRecord extends VoicePreviewIdentity {
  contentType: string;
  id: string;
  publicUrl: string;
  sizeBytes: number;
  storageKey: string;
}

export interface MinimaxVoicePreviewDeps {
  buildPublicUrl: (id: string) => string;
  buildStorageKey: (input: VoicePreviewIdentity) => string;
  generateId: () => string;
  hashText: (text: string) => string;
  insertPreview: (record: NewVoicePreviewRecord) => Promise<VoicePreviewRecord | null>;
  loadPreview: (identity: VoicePreviewIdentity) => Promise<VoicePreviewRecord | null>;
  putObjectBytes: typeof putObjectBytes;
  synthesizeAudio: (input: {
    model: string;
    text: string;
    voice: MinimaxVoiceId;
  }) => Promise<Uint8Array>;
}

export interface MinimaxVoicePreviewResult {
  cached: boolean;
  previewText: string;
  url: string;
  voice: MinimaxVoiceId;
}

function serializePreview(row: typeof minimaxVoicePreview.$inferSelect): VoicePreviewRecord {
  return {
    contentType: row.contentType,
    createdAt: row.createdAt,
    format: row.format,
    id: row.id,
    model: row.model,
    previewText: row.previewText,
    previewTextHash: row.previewTextHash,
    publicUrl: row.publicUrl,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    updatedAt: row.updatedAt,
    voice: row.voice,
  };
}

async function loadPreview(identity: VoicePreviewIdentity): Promise<VoicePreviewRecord | null> {
  const [row] = await db
    .select()
    .from(minimaxVoicePreview)
    .where(
      and(
        eq(minimaxVoicePreview.voice, identity.voice),
        eq(minimaxVoicePreview.previewTextHash, identity.previewTextHash),
        eq(minimaxVoicePreview.model, identity.model),
        eq(minimaxVoicePreview.format, identity.format),
      ),
    )
    .limit(1);

  return row ? serializePreview(row) : null;
}

async function insertPreview(record: NewVoicePreviewRecord): Promise<VoicePreviewRecord | null> {
  const now = new Date();
  const [row] = await db
    .insert(minimaxVoicePreview)
    .values({
      ...record,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        minimaxVoicePreview.voice,
        minimaxVoicePreview.previewTextHash,
        minimaxVoicePreview.model,
        minimaxVoicePreview.format,
      ],
    })
    .returning();

  return row ? serializePreview(row) : null;
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 32);
}

function safeVoiceIdForPath(voice: string): string {
  const safe = voice
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "_")
    .replaceAll(/_+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
  return safe.slice(0, 160) || "voice";
}

function buildStorageKey(identity: VoicePreviewIdentity): string {
  return `voice-previews/minimax/${identity.model}/${identity.previewTextHash}/${safeVoiceIdForPath(identity.voice)}.${identity.format}`;
}

function buildPublicUrl(id: string): string {
  return `/api/public/minimax-voice-previews/${encodeURIComponent(id)}`;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[\da-f]+$/i.test(hex)) {
    throw new Error("MiniMax returned invalid hex audio.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function synthesizeAudio(input: {
  model: string;
  text: string;
  voice: MinimaxVoiceId;
}): Promise<Uint8Array> {
  const apiKey = process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not configured.");
  }

  const baseUrl = (process.env.MINIMAX_TTS_BASE_URL?.trim() || "https://api.minimax.chat").replace(
    /\/+$/,
    "",
  );
  const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
    body: JSON.stringify({
      audio_setting: {
        bitrate: 128_000,
        channel: 1,
        format: MINIMAX_VOICE_PREVIEW_FORMAT,
        sample_rate: 32_000,
      },
      language_boost: input.voice.startsWith("Cantonese_") ? "Chinese,Yue" : "Chinese",
      model: input.model,
      output_format: "hex",
      stream: false,
      text: input.text,
      voice_setting: {
        pitch: 0,
        speed: 1,
        voice_id: input.voice,
        vol: 1,
      },
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`MiniMax TTS request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { audio?: string | null };
  };
  if (payload.base_resp?.status_code !== 0) {
    throw new Error(payload.base_resp?.status_msg || "MiniMax TTS request failed.");
  }
  const audioHex = payload.data?.audio;
  if (!audioHex) {
    throw new Error("MiniMax TTS response did not include audio.");
  }

  return hexToBytes(audioHex);
}

function toResult(row: VoicePreviewRecord, cached: boolean): MinimaxVoicePreviewResult {
  return {
    cached,
    previewText: row.previewText,
    url: row.publicUrl,
    voice: row.voice,
  };
}

const defaultDeps: MinimaxVoicePreviewDeps = {
  buildPublicUrl,
  buildStorageKey,
  generateId: randomUUID,
  hashText,
  insertPreview,
  loadPreview,
  putObjectBytes,
  synthesizeAudio,
};

export async function getOrCreateMinimaxVoicePreview(
  input: { voice: MinimaxVoiceId },
  deps: MinimaxVoicePreviewDeps = defaultDeps,
): Promise<MinimaxVoicePreviewResult> {
  const identity: VoicePreviewIdentity = {
    format: MINIMAX_VOICE_PREVIEW_FORMAT,
    model: MINIMAX_VOICE_PREVIEW_MODEL,
    previewText: MINIMAX_VOICE_PREVIEW_TEXT,
    previewTextHash: deps.hashText(MINIMAX_VOICE_PREVIEW_TEXT),
    voice: input.voice,
  };

  const existing = await deps.loadPreview(identity);
  if (existing) {
    return toResult(existing, true);
  }

  const audio = await deps.synthesizeAudio({
    model: identity.model,
    text: identity.previewText,
    voice: identity.voice,
  });
  const storageKey = deps.buildStorageKey(identity);
  await deps.putObjectBytes({
    body: audio,
    contentType: MINIMAX_VOICE_PREVIEW_CONTENT_TYPE,
    storageKey,
  });

  const id = deps.generateId();
  const publicUrl = deps.buildPublicUrl(id);
  const inserted = await deps.insertPreview({
    ...identity,
    contentType: MINIMAX_VOICE_PREVIEW_CONTENT_TYPE,
    id,
    publicUrl,
    sizeBytes: audio.byteLength,
    storageKey,
  });
  if (inserted) {
    return toResult(inserted, false);
  }

  const winner = await deps.loadPreview(identity);
  if (!winner) {
    throw new Error("Voice preview cache insert conflicted but no cached row was found.");
  }
  return toResult(winner, true);
}
