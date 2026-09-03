import { z } from "zod";
import type { LiveTranscriptEvent } from "./live-transcript-draft";

export const WORKLET_SAMPLE_RATE = 24_000;
export const DASHSCOPE_SAMPLE_RATE = 16_000;

export const dashScopeServerEventSchema = z.object({
  end_ms: z.number().int().nonnegative().optional(),
  item_id: z.string().optional(),
  model: z.string().optional(),
  original_text: z.string().optional(),
  start_ms: z.number().int().nonnegative().optional(),
  stash: z.string().optional(),
  status: z.string().optional(),
  text: z.string().optional(),
  transcript: z.string().optional(),
  type: z.string().optional(),
  words: z
    .array(
      z.object({
        end_ms: z.number().int().nonnegative(),
        punctuation: z.string().max(16),
        start_ms: z.number().int().nonnegative(),
        text: z.string().min(1).max(256),
      }),
    )
    .max(2000)
    .optional(),
});

export type DashScopeServerEvent = z.infer<typeof dashScopeServerEventSchema>;

export function resamplePcm16(
  input: Int16Array,
  fromRate = WORKLET_SAMPLE_RATE,
  toRate = DASHSCOPE_SAMPLE_RATE,
): Int16Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const source = index * ratio;
    const sourceIndex = Math.floor(source);
    const fraction = source - sourceIndex;
    const left = input[sourceIndex] ?? 0;
    const right = input[Math.min(sourceIndex + 1, input.length - 1)] ?? left;
    output[index] = Math.round(left + (right - left) * fraction);
  }
  return output;
}

function completedTranscriptEvent(event: DashScopeServerEvent): LiveTranscriptEvent | null {
  if (!(event.item_id && event.transcript)) {
    return null;
  }
  const transcript: LiveTranscriptEvent = {
    itemId: event.item_id,
    text: event.transcript,
    type: "completed",
  };
  if (event.end_ms !== undefined) {
    transcript.endMs = event.end_ms;
  }
  if (event.start_ms !== undefined) {
    transcript.startMs = event.start_ms;
  }
  if (event.words) {
    transcript.words = event.words.map((word) => ({
      endMs: word.end_ms,
      punctuation: word.punctuation,
      startMs: word.start_ms,
      text: word.text,
    }));
  }
  return transcript;
}

export function handleDashScopeEvent(
  event: DashScopeServerEvent,
  input: {
    onDisconnect: (reason: string) => void;
    onTranscript: (event: LiveTranscriptEvent) => void;
  },
): void {
  if (event.type === "meeting.transcription.correction-status") {
    if (
      event.item_id &&
      event.original_text &&
      (event.status === "started" || event.status === "finished")
    ) {
      input.onTranscript({
        itemId: event.item_id,
        originalText: event.original_text,
        text: "",
        type: event.status === "started" ? "correction-started" : "correction-finished",
      });
    }
    return;
  }
  if (event.type === "meeting.transcription.corrected") {
    if (event.item_id && event.model && event.original_text && event.transcript?.trim()) {
      input.onTranscript({
        correctionModel: event.model,
        itemId: event.item_id,
        originalText: event.original_text,
        text: event.transcript,
        type: "corrected",
      });
    }
    return;
  }
  if (event.type === "conversation.item.input_audio_transcription.text") {
    if (event.item_id) {
      const text = [event.text, event.stash].filter((part) => part !== undefined).join("");
      input.onTranscript({ itemId: event.item_id, text, type: "snapshot" });
    }
    return;
  }
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const transcript = completedTranscriptEvent(event);
    if (transcript) {
      input.onTranscript(transcript);
    }
    return;
  }
  if (event.type === "error" || event.type === "session.finished") {
    input.onDisconnect("provider-disconnected");
  }
}
