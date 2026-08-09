import { readFile } from "node:fs/promises";
import { z } from "zod";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type {
  CanonicalMeetingTranscript,
  CanonicalMeetingTranscriptTurn,
} from "@arc/shared/meeting-transcription";
import { MeetingProviderQuotaError } from "../provider";
import type { FinalTranscriptionAudioChunk, MeetingTranscriptionProvider } from "../provider";

const openAiDiarizedResponseSchema = z
  .object({
    language: z.string().nullish(),
    segments: z.array(
      z
        .object({
          end: z.number().nonnegative(),
          speaker: z.string().min(1),
          start: z.number().nonnegative(),
          text: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

interface OpenAiMeetingTranscriptionDependencies {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  readAudioFile?: (filePath: string) => Promise<Uint8Array>;
  requestTimeoutMs?: number;
}

function mapSegment(input: {
  chunk: FinalTranscriptionAudioChunk;
  remoteSpeakerKey: string | null;
  segment: z.infer<typeof openAiDiarizedResponseSchema>["segments"][number];
}): CanonicalMeetingTranscriptTurn | null {
  const text = input.segment.text.trim();
  if (!text) {
    return null;
  }
  const startMs = Math.max(
    input.chunk.startMs,
    Math.round(input.chunk.startMs + input.segment.start * 1000),
  );
  const endMs = Math.min(
    input.chunk.endMs,
    Math.round(input.chunk.startMs + input.segment.end * 1000),
  );
  if (endMs <= startMs) {
    return null;
  }
  const local = input.chunk.track === "microphone";
  return {
    confidence: null,
    endMs,
    speakerKey: local ? "local" : (input.remoteSpeakerKey ?? "remote-0"),
    startMs,
    text,
    track: local ? "local" : "remote",
  };
}

export function createOpenAiMeetingTranscriptionProvider(
  dependencies: OpenAiMeetingTranscriptionDependencies,
): MeetingTranscriptionProvider {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const readAudioFile = dependencies.readAudioFile ?? readFile;
  const baseUrl = dependencies.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1";
  return {
    async transcribeFinal(input): Promise<CanonicalMeetingTranscript> {
      if (!dependencies.apiKey.trim()) {
        throw new Error("OPENAI_API_KEY is not set for Meeting transcription");
      }
      const turns: CanonicalMeetingTranscriptTurn[] = [];
      const languages: string[] = [];
      const remoteSpeakers = new Map<string, string>();
      const chunks = [...input.chunks].toSorted(
        (left, right) => left.startMs - right.startMs || left.track.localeCompare(right.track),
      );
      for (const chunk of chunks) {
        const bytes = await readAudioFile(chunk.filePath);
        const form = new FormData();
        form.append(
          "file",
          new Blob([Uint8Array.from(bytes).buffer], { type: chunk.contentType }),
          `${chunk.track}.webm`,
        );
        form.append("model", input.model);
        form.append("response_format", "diarized_json");
        form.append("chunking_strategy", "auto");
        if (input.languageHint) {
          form.append("language", input.languageHint);
        }
        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
          body: form,
          headers: { Authorization: `Bearer ${dependencies.apiKey}` },
          method: "POST",
          signal: AbortSignal.timeout(dependencies.requestTimeoutMs ?? 5 * 60 * 1000),
        });
        if (!response.ok) {
          if (response.status === 429) {
            throw new MeetingProviderQuotaError();
          }
          throw new Error(`OpenAI transcription failed with HTTP ${response.status}`);
        }
        const providerResponse = openAiDiarizedResponseSchema.parse(await response.json());
        if (providerResponse.language) {
          languages.push(providerResponse.language);
        }
        for (const segment of providerResponse.segments) {
          const remoteIdentity = `${chunk.index}:${segment.speaker}`;
          if (chunk.track === "system" && !remoteSpeakers.has(remoteIdentity)) {
            remoteSpeakers.set(remoteIdentity, `remote-${remoteSpeakers.size + 1}`);
          }
          const turn = mapSegment({
            chunk,
            remoteSpeakerKey: remoteSpeakers.get(remoteIdentity) ?? null,
            segment,
          });
          if (turn) {
            turns.push(turn);
          }
        }
      }
      turns.sort(
        (left, right) =>
          left.startMs - right.startMs ||
          left.track.localeCompare(right.track) ||
          left.endMs - right.endMs,
      );
      return canonicalMeetingTranscriptSchema.parse({
        language: languages[0] ?? input.languageHint,
        turns,
      });
    },
  };
}
