// oxlint-disable promise/avoid-new -- WebSocket connection readiness is exposed as a promise.
import {
  DEFAULT_DEEPGRAM_ENDPOINTING_MS,
  meetingLiveTranscriptWordSchema,
} from "@app/shared/meeting-transcription";
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptWord,
} from "@app/shared/meeting-transcription";
import { z } from "zod";
import type { LiveTranscriptConnection, LiveTranscriptEvent } from "./live-transcript-draft";

const CONNECTION_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 1500;
const FINALIZE_TIMEOUT_MS = 1500;
const MAX_BUFFERED_BYTES = 256 * 1024;
const deepgramResultSchema = z
  .object({
    channel: z.object({
      alternatives: z.array(
        z.object({
          transcript: z.string(),
          words: z.array(
            z.object({
              end: z.number().nonnegative(),
              punctuated_word: z.string().optional(),
              speaker: z.number().int().nonnegative().optional(),
              start: z.number().nonnegative(),
              word: z.string(),
            }),
          ),
        }),
      ),
    }),
    from_finalize: z.boolean().optional(),
    is_final: z.boolean(),
    speech_final: z.boolean().optional(),
    start: z.number().nonnegative(),
    type: z.literal("Results"),
  })
  .passthrough();
const deepgramUtteranceEndSchema = z
  .object({
    channel: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]),
    last_word_end: z.number().nonnegative(),
    type: z.literal("UtteranceEnd"),
  })
  .passthrough();
const deepgramMessageSchema = z.union([deepgramResultSchema, deepgramUtteranceEndSchema]);

type DeepgramWord = z.infer<
  typeof deepgramResultSchema
>["channel"]["alternatives"][number]["words"][number];
type DeepgramMessage = z.infer<typeof deepgramMessageSchema>;

function wordText(word: DeepgramWord): string {
  return word.punctuated_word ?? word.word;
}

function wordToLiveWord(word: DeepgramWord): MeetingLiveTranscriptWord | null {
  const formatted = wordText(word);
  const punctuation = formatted.startsWith(word.word)
    ? formatted.slice(word.word.length, word.word.length + 16)
    : "";
  const parsed = meetingLiveTranscriptWordSchema.safeParse({
    endMs: Math.round(word.end * 1000),
    punctuation,
    startMs: Math.round(word.start * 1000),
    text: word.word,
  });
  return parsed.success ? parsed.data : null;
}

function joinWords(words: DeepgramWord[]): string {
  let text = "";
  for (const [index, word] of words.entries()) {
    const value = wordText(word);
    text +=
      index === 0 ||
      /[\p{Script=Han}\p{P}\p{S}]$/u.test(text) ||
      /^[\p{Script=Han}\p{P}\p{S}]/u.test(value)
        ? value
        : ` ${value}`;
  }
  return text;
}

interface DeepgramGroup {
  speaker: number | undefined;
  words: DeepgramWord[];
}

interface DeepgramGroupContext {
  isFinal: boolean;
  segmentCompleted: boolean;
  segmentKey: number;
  speechFinal: boolean;
  track: MeetingLiveTranscriptAuthorization["track"];
  utteranceKey: number;
}

interface DeepgramRunState {
  buffer: string;
  finalWords: MeetingLiveTranscriptWord[];
  window: string;
  windowWords: MeetingLiveTranscriptWord[];
}

interface DeepgramSpeakerRun {
  key: number;
  speaker: number | undefined;
}

interface ResolvedSpeakerRuns {
  nextSegmentKey: number;
  runs: DeepgramSpeakerRun[];
}

interface FinalizedDeepgramWord {
  endMs: number;
  startMs: number;
  text: string;
}

const MAX_DEDUPLICATION_WORDS = 512;
const MAX_LIVE_WORDS_PER_TURN = 2000;

function isDuplicateFinalizedWord(
  word: DeepgramWord,
  finalizedWords: FinalizedDeepgramWord[],
): boolean {
  const startMs = Math.round(word.start * 1000);
  const endMs = Math.round(word.end * 1000);
  const text = wordText(word).trim();
  if (!text) {
    return false;
  }
  return finalizedWords.some((candidate) => {
    if (candidate.text !== text) {
      return false;
    }
    const overlapMs = Math.max(
      0,
      Math.min(endMs, candidate.endMs) - Math.max(startMs, candidate.startMs),
    );
    const shorterDurationMs = Math.min(endMs - startMs, candidate.endMs - candidate.startMs);
    return (
      (Math.abs(startMs - candidate.startMs) <= 100 && Math.abs(endMs - candidate.endMs) <= 100) ||
      (shorterDurationMs > 0 && overlapMs / shorterDurationMs >= 0.8)
    );
  });
}

function groupWordsBySpeaker(words: DeepgramWord[]): DeepgramGroup[] {
  const groups: DeepgramGroup[] = [];
  for (const word of words) {
    const previous = groups.at(-1);
    if (previous && previous.speaker === word.speaker) {
      previous.words.push(word);
    } else {
      groups.push({ speaker: word.speaker, words: [word] });
    }
  }
  return groups;
}

function resolveSpeakerRuns(input: {
  activeRun: DeepgramSpeakerRun | null;
  groups: DeepgramGroup[];
  nextSegmentKey: number;
  previewRuns: DeepgramSpeakerRun[];
}): ResolvedSpeakerRuns {
  const runs: DeepgramSpeakerRun[] = [];
  let previousRun = input.activeRun;
  let { nextSegmentKey } = input;
  for (const [index, group] of input.groups.entries()) {
    const previewRun = input.previewRuns[index];
    let run: DeepgramSpeakerRun;
    if (index === 0 && previousRun && previousRun.speaker === group.speaker) {
      run = previousRun;
    } else if (previewRun && previewRun.speaker === group.speaker) {
      run = previewRun;
    } else {
      run = { key: nextSegmentKey, speaker: group.speaker };
      nextSegmentKey += 1;
    }
    runs.push(run);
    previousRun = run;
  }
  return { nextSegmentKey, runs };
}

function rememberFinalizedWords(
  finalizedWords: FinalizedDeepgramWord[],
  words: DeepgramWord[],
): void {
  finalizedWords.push(
    ...words.map((word) => ({
      endMs: Math.round(word.end * 1000),
      startMs: Math.round(word.start * 1000),
      text: wordText(word).trim(),
    })),
  );
  if (finalizedWords.length > MAX_DEDUPLICATION_WORDS) {
    finalizedWords.splice(0, finalizedWords.length - MAX_DEDUPLICATION_WORDS);
  }
}

function buildDeepgramGroupEvent(
  group: DeepgramGroup,
  context: DeepgramGroupContext,
  state: DeepgramRunState,
): LiveTranscriptEvent | null {
  const windowText = joinWords(group.words);
  const liveWords: MeetingLiveTranscriptWord[] = [];
  for (const word of group.words) {
    const liveWord = wordToLiveWord(word);
    if (liveWord && liveWords.length < MAX_LIVE_WORDS_PER_TURN) {
      liveWords.push(liveWord);
    }
  }
  if (context.isFinal) {
    state.buffer += windowText;
    state.finalWords.push(...liveWords.slice(0, MAX_LIVE_WORDS_PER_TURN - state.finalWords.length));
    state.window = "";
    state.windowWords = [];
  } else {
    state.window = windowText;
    state.windowWords = liveWords;
  }
  const text = `${state.buffer}${state.window}`;
  if (!text.trim()) {
    return null;
  }
  const words = [...state.finalWords, ...state.windowWords].slice(0, MAX_LIVE_WORDS_PER_TURN);
  return {
    endMs: words.length ? Math.max(...words.map((word) => word.endMs)) : undefined,
    itemId: `${context.utteranceKey}:${context.segmentKey}`,
    speakerKey:
      group.speaker === undefined
        ? undefined
        : `${context.track}:deepgram-speaker-${group.speaker}`,
    startMs: words.length ? Math.min(...words.map((word) => word.startMs)) : undefined,
    text,
    type: context.speechFinal || context.segmentCompleted ? "completed" : "snapshot",
    words,
  };
}

function completeDeepgramRun(
  run: DeepgramSpeakerRun,
  state: DeepgramRunState | undefined,
  track: MeetingLiveTranscriptAuthorization["track"],
  utteranceKey: number,
): LiveTranscriptEvent | null {
  if (!state) {
    return null;
  }
  const text = `${state.buffer}${state.window}`;
  if (!text.trim()) {
    return null;
  }
  const words = [...state.finalWords, ...state.windowWords].slice(0, MAX_LIVE_WORDS_PER_TURN);
  return {
    endMs: words.length ? Math.max(...words.map((word) => word.endMs)) : undefined,
    itemId: `${utteranceKey}:${run.key}`,
    speakerKey: run.speaker === undefined ? undefined : `${track}:deepgram-speaker-${run.speaker}`,
    startMs: words.length ? Math.min(...words.map((word) => word.startMs)) : undefined,
    text,
    type: "completed",
    words,
  };
}

/**
 * Deepgram 的 is_final 只代表“当前这个窗口已达到最高准确率（文本不再变化）”，同一句连续话语中会多次出现，
 * 且每次 is_final=true 都会使 start 前移、开启一个新窗口。真正的“一句话结束”是 speech_final=true。
 * 相邻窗口的尾部词可能重叠/重复（甚至被改判到另一个说话人），但多人插话时合法词也可能在时间上重叠。
 * 因此这里只对“文本相同且时间区间高度重叠”的已定型词去重，并以连续 speaker run 作为 turn；同一说话人
 * 被别人打断后再次说话会获得新的 turn id，同一 speaker run 跨多个 is_final 窗口则继续累计。
 */
export function createDeepgramResultEventMapper() {
  let utteranceKey = 0;
  let nextSegmentKey = 0;
  let activeRun: DeepgramSpeakerRun | null = null;
  let previewRuns: DeepgramSpeakerRun[] = [];
  const finalizedWords: FinalizedDeepgramWord[] = [];
  const speech = new Map<number, DeepgramRunState>();

  // oxlint-disable-next-line complexity -- one ordered pass must update the coupled interim, final, speaker-run, and utterance state.
  return (
    raw: DeepgramMessage,
    track: MeetingLiveTranscriptAuthorization["track"],
  ): LiveTranscriptEvent[] => {
    if (raw.type === "UtteranceEnd") {
      if (!activeRun) {
        return [];
      }
      const completed = completeDeepgramRun(
        activeRun,
        speech.get(activeRun.key),
        track,
        utteranceKey,
      );
      utteranceKey += 1;
      activeRun = null;
      previewRuns = [];
      speech.clear();
      return completed ? [completed] : [];
    }
    const [alternative] = raw.channel.alternatives;
    const speechFinal = raw.speech_final === true || raw.from_finalize === true;
    if (!alternative?.transcript.trim() || alternative.words.length === 0) {
      const completed =
        speechFinal && activeRun
          ? completeDeepgramRun(activeRun, speech.get(activeRun.key), track, utteranceKey)
          : null;
      if (speechFinal) {
        utteranceKey += 1;
        activeRun = null;
        previewRuns = [];
        speech.clear();
      }
      return completed ? [completed] : [];
    }
    const isFinal = raw.is_final;
    const words = alternative.words.filter(
      (word) => !isDuplicateFinalizedWord(word, finalizedWords),
    );
    const groups = groupWordsBySpeaker(words);
    const { nextSegmentKey: resolvedNextSegmentKey, runs } = resolveSpeakerRuns({
      activeRun,
      groups,
      nextSegmentKey,
      previewRuns,
    });
    nextSegmentKey = resolvedNextSegmentKey;
    const events: LiveTranscriptEvent[] = [];
    const [firstGroup] = groups;
    if (isFinal && activeRun && firstGroup && activeRun.speaker !== firstGroup.speaker) {
      const completed = completeDeepgramRun(
        activeRun,
        speech.get(activeRun.key),
        track,
        utteranceKey,
      );
      if (completed) {
        events.push(completed);
      }
    }
    for (const [index, group] of groups.entries()) {
      const run = runs[index];
      if (!run) {
        continue;
      }
      const state = speech.get(run.key) ?? {
        buffer: "",
        finalWords: [],
        window: "",
        windowWords: [],
      };
      const event = buildDeepgramGroupEvent(
        group,
        {
          isFinal,
          segmentCompleted: isFinal && index < groups.length - 1,
          segmentKey: run.key,
          speechFinal,
          track,
          utteranceKey,
        },
        state,
      );
      speech.set(run.key, state);
      if (event) {
        events.push(event);
      }
    }
    if (isFinal) {
      activeRun = runs.at(-1) ?? activeRun;
      previewRuns = [];
      rememberFinalizedWords(finalizedWords, words);
    } else {
      previewRuns = runs;
    }
    if (speechFinal && events.length === 0 && activeRun) {
      const completed = completeDeepgramRun(
        activeRun,
        speech.get(activeRun.key),
        track,
        utteranceKey,
      );
      if (completed) {
        events.push(completed);
      }
    }
    if (speechFinal) {
      utteranceKey += 1;
      activeRun = null;
      previewRuns = [];
      speech.clear();
    }
    return events;
  };
}

export function createDeepgramLiveUrl(authorization: MeetingLiveTranscriptAuthorization): string {
  const url = new URL(authorization.baseUrl ?? "wss://api.deepgram.com/v1/listen");
  url.searchParams.set("channels", "1");
  url.searchParams.set("diarize_model", "latest");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set(
    "endpointing",
    String(authorization.endpointingMs ?? DEFAULT_DEEPGRAM_ENDPOINTING_MS),
  );
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("language", authorization.language ?? "zh-CN");
  url.searchParams.set("model", authorization.model);
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("sample_rate", "24000");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("utterance_end_ms", "1000");
  url.searchParams.set("vad_events", "true");
  return url.toString();
}

export async function connectDeepgramRealtimeTranscription(input: {
  authorization: MeetingLiveTranscriptAuthorization;
  onDisconnect: (reason: string) => void;
  onTranscript: (event: LiveTranscriptEvent) => void;
  onWritable: () => void;
}): Promise<LiveTranscriptConnection> {
  const socket = new WebSocket(createDeepgramLiveUrl(input.authorization), [
    "bearer",
    input.authorization.clientSecret,
  ]);
  const mapResult = createDeepgramResultEventMapper();
  let closing = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  let finalizePromise: Promise<void> | null = null;
  let finalizeRequested = false;
  let finalizeTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveFinalize: (() => void) | null = null;
  const settleFinalize = () => {
    clearTimeout(finalizeTimer);
    finalizeTimer = undefined;
    resolveFinalize?.();
    resolveFinalize = null;
  };
  const opened = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Deepgram 实时字幕连接超时")),
      CONNECTION_TIMEOUT_MS,
    );
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Deepgram 实时字幕连接失败"));
      },
      { once: true },
    );
  });
  socket.addEventListener("message", (event) => {
    if (closing) {
      return;
    }
    const textFrame = z.string().safeParse(event.data);
    if (!textFrame.success) {
      return;
    }
    try {
      const result = deepgramMessageSchema.safeParse(JSON.parse(textFrame.data));
      if (!result.success) {
        return;
      }
      for (const transcriptEvent of mapResult(result.data, input.authorization.track)) {
        input.onTranscript(transcriptEvent);
      }
      if (result.data.type === "Results" && result.data.from_finalize === true) {
        settleFinalize();
      }
    } catch {
      // Ignore provider control frames and malformed non-transcript messages.
    }
  });
  socket.addEventListener("close", (event) => {
    clearTimeout(closeTimer);
    clearTimeout(drainTimer);
    settleFinalize();
    if (!closing) {
      input.onDisconnect(event.reason || `provider-disconnected:${event.code}`);
    }
  });
  try {
    await opened;
  } catch (error) {
    closing = true;
    socket.close();
    throw error;
  }
  input.onWritable();

  const waitForDrain = () => {
    clearTimeout(drainTimer);
    const poll = () => {
      if (closing || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (socket.bufferedAmount <= MAX_BUFFERED_BYTES / 2) {
        input.onWritable();
        return;
      }
      drainTimer = setTimeout(poll, 25);
    };
    drainTimer = setTimeout(poll, 25);
  };

  return {
    close: () => {
      closing = true;
      clearTimeout(drainTimer);
      settleFinalize();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "CloseStream" }));
        closeTimer = setTimeout(() => socket.close(), CLOSE_TIMEOUT_MS);
        return;
      }
      socket.close();
    },
    finalize: () => {
      if (closing || socket.readyState !== WebSocket.OPEN) {
        return Promise.resolve();
      }
      if (finalizeRequested) {
        return finalizePromise ?? Promise.resolve();
      }
      finalizeRequested = true;
      finalizePromise = new Promise<void>((resolve) => {
        resolveFinalize = resolve;
        finalizeTimer = setTimeout(settleFinalize, FINALIZE_TIMEOUT_MS);
      });
      socket.send(JSON.stringify({ type: "Finalize" }));
      return finalizePromise;
    },
    sendPcm: (frame) => {
      if (
        closing ||
        finalizeRequested ||
        socket.readyState !== WebSocket.OPEN ||
        socket.bufferedAmount > MAX_BUFFERED_BYTES
      ) {
        waitForDrain();
        return false;
      }
      const bytes = new ArrayBuffer(frame.byteLength);
      new Int16Array(bytes).set(frame);
      socket.send(bytes);
      return true;
    },
  };
}
