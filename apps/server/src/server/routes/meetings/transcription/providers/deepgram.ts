import { readFile } from "node:fs/promises";
import { z } from "zod";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type {
  CanonicalMeetingTranscript,
  CanonicalMeetingTranscriptTurn,
} from "@arc/shared/meeting-transcription";
import { MeetingProviderQuotaError, MeetingProviderResponseError } from "../provider";
import type { MeetingTranscriptionProvider } from "../provider";

const deepgramResponseSchema = z
  .object({
    metadata: z
      .object({
        duration: z.number().nonnegative(),
        request_id: z.string().nullish(),
      })
      .passthrough(),
    results: z
      .object({
        utterances: z.array(
          z
            .object({
              confidence: z.number().min(0).max(1).nullish(),
              end: z.number().nonnegative(),
              speaker: z.number().int().nonnegative(),
              start: z.number().nonnegative(),
              transcript: z.string(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

interface DeepgramMeetingTranscriptionDependencies {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  readAudioFile?: (filePath: string) => Promise<Uint8Array>;
  requestTimeoutMs?: number;
}

export function createDeepgramMeetingTranscriptionProvider(
  dependencies: DeepgramMeetingTranscriptionDependencies,
): MeetingTranscriptionProvider {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const readAudioFile = dependencies.readAudioFile ?? readFile;
  const baseUrl = dependencies.baseUrl?.replace(/\/$/, "") || "https://api.deepgram.com";
  return {
    async transcribeFinal(input): Promise<CanonicalMeetingTranscript> {
      if (!dependencies.apiKey.trim()) {
        throw new Error("DEEPGRAM_API_KEY is not set for Meeting transcription");
      }
      const turns: CanonicalMeetingTranscriptTurn[] = [];
      const remoteSpeakers = new Map<string, string>();
      const chunks = [...input.chunks].toSorted(
        (left, right) => left.startMs - right.startMs || left.track.localeCompare(right.track),
      );
      for (const chunk of chunks) {
        const signal = input.signal
          ? AbortSignal.any([
              input.signal,
              AbortSignal.timeout(dependencies.requestTimeoutMs ?? 5 * 60 * 1000),
            ])
          : AbortSignal.timeout(dependencies.requestTimeoutMs ?? 5 * 60 * 1000);
        const query = new URLSearchParams({
          diarize_model: "v2",
          mip_opt_out: "true",
          model: input.model,
          punctuate: "true",
          smart_format: "true",
          utterances: "true",
        });
        if (input.languageHint) {
          query.set("language", input.languageHint);
        }
        const response = await fetch(`${baseUrl}/v1/listen?${query}`, {
          body: new Blob([Uint8Array.from(await readAudioFile(chunk.filePath)).buffer], {
            type: chunk.contentType,
          }),
          headers: {
            Authorization: `Token ${dependencies.apiKey}`,
            "Content-Type": chunk.contentType,
          },
          method: "POST",
          signal,
        });
        if (response.status === 206) {
          throw new MeetingProviderResponseError("partial-result", "Deepgram");
        }
        if (!response.ok) {
          if (response.status === 429) {
            throw new MeetingProviderQuotaError();
          }
          throw new Error(`Deepgram transcription failed with HTTP ${response.status}`);
        }
        let parsed: z.infer<typeof deepgramResponseSchema>;
        try {
          parsed = deepgramResponseSchema.parse(await response.json());
        } catch {
          throw new MeetingProviderResponseError("malformed-response", "Deepgram");
        }
        for (const utterance of parsed.results.utterances) {
          const text = utterance.transcript.trim();
          if (!text) {
            continue;
          }
          const startMs = Math.max(
            chunk.startMs,
            chunk.startMs + Math.round(utterance.start * 1000),
          );
          const endMs = Math.min(chunk.endMs, chunk.startMs + Math.round(utterance.end * 1000));
          if (endMs <= startMs) {
            continue;
          }
          const local = chunk.track === "microphone";
          const identity = `${chunk.index}:${utterance.speaker}`;
          if (!local && !remoteSpeakers.has(identity)) {
            remoteSpeakers.set(identity, `remote-${remoteSpeakers.size + 1}`);
          }
          turns.push({
            confidence: utterance.confidence ?? null,
            endMs,
            speakerKey: local ? "local" : (remoteSpeakers.get(identity) ?? "remote-1"),
            startMs,
            text,
            track: local ? "local" : "remote",
          });
        }
      }
      turns.sort(
        (left, right) =>
          left.startMs - right.startMs ||
          left.track.localeCompare(right.track) ||
          left.endMs - right.endMs,
      );
      return canonicalMeetingTranscriptSchema.parse({ language: input.languageHint, turns });
    },
  };
}
