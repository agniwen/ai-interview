import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "@arc/db-schema/json";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type {
  CanonicalMeetingTranscript,
  CanonicalMeetingTranscriptTurn,
} from "@arc/shared/meeting-transcription";
import { MeetingProviderResponseError } from "../provider";
import type { FinalTranscriptionAudioChunk, MeetingTranscriptionProvider } from "../provider";

const tingwuResultSchema = z
  .object({
    TaskId: z.string().min(1),
    Transcription: z
      .object({
        AudioInfo: z
          .object({
            Duration: z.number().nonnegative(),
            Language: z.string().nullish(),
          })
          .passthrough(),
        Paragraphs: z.array(
          z
            .object({
              SpeakerId: z.string().min(1),
              Words: z.array(
                z
                  .object({
                    End: z.number().nonnegative(),
                    Start: z.number().nonnegative(),
                    Text: z.string(),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

interface TingwuMeetingTranscriptionDependencies {
  createAudioUrl: (chunk: FinalTranscriptionAudioChunk, signal: AbortSignal) => Promise<string>;
  createTask: (input: {
    audioUrl: string;
    language: string;
    model: string;
    signal: AbortSignal;
    taskKey: string;
  }) => Promise<{ taskId: string }>;
  fetchResult: (url: string, signal: AbortSignal) => Promise<JsonValue>;
  pollTask: (
    taskId: string,
    signal: AbortSignal,
  ) => Promise<{ resultUrl?: string; status: string }>;
  requestTimeoutMs?: number;
  taskKeyPrefix?: string;
}

function tingwuLanguage(languageHint: string | null): string {
  const language = languageHint?.trim().toLowerCase();
  if (language?.startsWith("en")) {
    return "en";
  }
  if (["cn", "ja", "yue"].includes(language ?? "")) {
    return language ?? "fspk";
  }
  return "fspk";
}

export function createTingwuMeetingTranscriptionProvider(
  dependencies: TingwuMeetingTranscriptionDependencies,
): MeetingTranscriptionProvider {
  const taskKeyPrefix = dependencies.taskKeyPrefix ?? randomUUID();
  return {
    // oxlint-disable-next-line complexity -- polling, provider validation, and canonical mapping share one adapter boundary.
    async transcribeFinal(input): Promise<CanonicalMeetingTranscript> {
      const turns: CanonicalMeetingTranscriptTurn[] = [];
      const remoteSpeakers = new Map<string, string>();
      let language: string | null = input.languageHint;
      const chunks = [...input.chunks].toSorted(
        (left, right) => left.startMs - right.startMs || left.track.localeCompare(right.track),
      );
      for (const chunk of chunks) {
        const signal = input.signal
          ? AbortSignal.any([
              input.signal,
              AbortSignal.timeout(dependencies.requestTimeoutMs ?? 30 * 60 * 1000),
            ])
          : AbortSignal.timeout(dependencies.requestTimeoutMs ?? 30 * 60 * 1000);
        const audioUrl = await dependencies.createAudioUrl(chunk, signal);
        const task = await dependencies.createTask({
          audioUrl,
          language: tingwuLanguage(input.languageHint),
          model: input.model,
          signal,
          taskKey: `meeting-eval-${taskKeyPrefix}-${chunk.track}-${chunk.index}`,
        });
        const state = await dependencies.pollTask(task.taskId, signal);
        if (state.status !== "COMPLETED" || !state.resultUrl) {
          throw new MeetingProviderResponseError("partial-result", "Tingwu");
        }
        let result: z.infer<typeof tingwuResultSchema>;
        try {
          result = tingwuResultSchema.parse(
            await dependencies.fetchResult(state.resultUrl, signal),
          );
        } catch {
          throw new MeetingProviderResponseError("malformed-response", "Tingwu");
        }
        language = result.Transcription.AudioInfo.Language ?? language;
        for (const paragraph of result.Transcription.Paragraphs) {
          const words = paragraph.Words.filter((word) => word.Text.length > 0).toSorted(
            (left, right) => left.Start - right.Start,
          );
          if (words.length === 0) {
            continue;
          }
          const [firstWord] = words;
          if (!firstWord) {
            continue;
          }
          const startMs = Math.max(chunk.startMs, chunk.startMs + Math.round(firstWord.Start));
          const endMs = Math.min(
            chunk.endMs,
            chunk.startMs + Math.round(words.at(-1)?.End ?? firstWord.End),
          );
          if (endMs <= startMs) {
            continue;
          }
          const local = chunk.track === "microphone";
          const identity = `${chunk.index}:${paragraph.SpeakerId}`;
          if (!local && !remoteSpeakers.has(identity)) {
            remoteSpeakers.set(identity, `remote-${remoteSpeakers.size + 1}`);
          }
          turns.push({
            confidence: null,
            endMs,
            speakerKey: local ? "local" : (remoteSpeakers.get(identity) ?? "remote-1"),
            startMs,
            text: words
              .map((word) => word.Text)
              .join("")
              .trim(),
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
      return canonicalMeetingTranscriptSchema.parse({ language, turns });
    },
  };
}
