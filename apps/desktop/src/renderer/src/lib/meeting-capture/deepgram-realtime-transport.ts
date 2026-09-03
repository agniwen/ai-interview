// oxlint-disable promise/avoid-new -- WebSocket connection readiness is exposed as a promise.
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptWord,
} from "@app/shared/meeting-transcription";
import { z } from "zod";
import type { LiveTranscriptConnection, LiveTranscriptEvent } from "./live-transcript-draft";

const CONNECTION_TIMEOUT_MS = 10_000;
const MAX_BUFFERED_BYTES = 256 * 1024;
// 同一句话内部 Deepgram 会多次置 is_final=true；只有 speech_final 才代表一次停顿/一句结束。
// endpointing 抬高到 300ms，避免默认 10ms 在几乎每个短停顿就判定一句结束导致疯狂换行。
const DEEPGRAM_ENDPOINTING_MS = 300;

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
    is_final: z.boolean(),
    speech_final: z.boolean().optional(),
    start: z.number().nonnegative(),
    type: z.literal("Results"),
  })
  .passthrough();

type DeepgramWord = z.infer<
  typeof deepgramResultSchema
>["channel"]["alternatives"][number]["words"][number];
type DeepgramResult = z.infer<typeof deepgramResultSchema>;

function wordText(word: DeepgramWord): string {
  return word.punctuated_word ?? word.word;
}

function wordToLiveWord(word: DeepgramWord): MeetingLiveTranscriptWord {
  const formatted = wordText(word);
  const punctuation = formatted.startsWith(word.word)
    ? formatted.slice(word.word.length, word.word.length + 16)
    : "";
  return {
    endMs: Math.round(word.end * 1000),
    punctuation,
    startMs: Math.round(word.start * 1000),
    text: word.word,
  };
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
  lastEmittedEndMs: number;
  speechFinal: boolean;
  track: MeetingLiveTranscriptAuthorization["track"];
  utteranceKey: number;
}

interface DeepgramGroupEvent {
  event: LiveTranscriptEvent | null;
  lastEmittedEndMs: number;
}

function buildDeepgramGroupEvent(
  group: DeepgramGroup,
  context: DeepgramGroupContext,
  state: { buffer: string; window: string },
): DeepgramGroupEvent {
  const deduped: DeepgramWord[] = [];
  for (const word of group.words) {
    if (Math.round(word.end * 1000) > context.lastEmittedEndMs) {
      deduped.push(word);
    }
  }
  const windowText = joinWords(deduped);
  let { lastEmittedEndMs } = context;
  if (context.isFinal) {
    state.buffer += windowText;
    state.window = "";
    const lastEndMs = deduped.at(-1)?.end;
    if (lastEndMs !== undefined) {
      lastEmittedEndMs = Math.max(lastEmittedEndMs, Math.round(lastEndMs * 1000));
    }
  } else {
    state.window = windowText;
  }
  const [first] = deduped;
  const last = deduped.at(-1);
  const text = `${state.buffer}${state.window}`;
  if (!text.trim()) {
    return { event: null, lastEmittedEndMs };
  }
  const liveWords: MeetingLiveTranscriptWord[] = [];
  for (const word of deduped) {
    liveWords.push(wordToLiveWord(word));
  }
  return {
    event: {
      endMs: last ? Math.round(last.end * 1000) : undefined,
      itemId: `${context.utteranceKey}:${group.speaker === undefined ? "none" : group.speaker}`,
      speakerKey:
        group.speaker === undefined
          ? undefined
          : `${context.track}:deepgram-speaker-${group.speaker}`,
      startMs: first ? Math.round(first.start * 1000) : undefined,
      text,
      type: context.speechFinal ? "completed" : "snapshot",
      words: liveWords,
    },
    lastEmittedEndMs,
  };
}

/**
 * Deepgram 的 is_final 只代表“当前这个窗口已达到最高准确率（文本不再变化）”，同一句连续话语中会多次出现，
 * 且每次 is_final=true 都会使 start 前移、开启一个新窗口。真正的“一句话结束”是 speech_final=true。
 * 此外，相邻窗口的尾部词会重叠/被重复发出（甚至被改判到另一个说话人）。这里按“已发出的最大词尾时间”做
 * 时间轴去重，把同一 utterance 内的多次 is_final 窗口累计进同一个 turn，只在 speech_final 才换行/定型，
 * 去掉重叠后的文本拼起来就不会出现“前半句 + 前半句尾巴再拼一遍”的重复。单声道时间轴单调，按时间戳去重安全。
 */
export function createDeepgramResultEventMapper() {
  let utteranceKey = 0;
  let lastEmittedEndMs = -1;
  const speech = new Map<number | undefined, { buffer: string; window: string }>();

  return (
    raw: DeepgramResult,
    track: MeetingLiveTranscriptAuthorization["track"],
  ): LiveTranscriptEvent[] => {
    const [alternative] = raw.channel.alternatives;
    if (!alternative?.transcript.trim() || alternative.words.length === 0) {
      return [];
    }
    const isFinal = raw.is_final;
    const speechFinal = raw.speech_final === true;
    const groups: DeepgramGroup[] = [];
    for (const word of alternative.words) {
      const previous = groups.at(-1);
      if (previous && previous.speaker === word.speaker) {
        previous.words.push(word);
      } else {
        groups.push({ speaker: word.speaker, words: [word] });
      }
    }
    const events: LiveTranscriptEvent[] = [];
    for (const group of groups) {
      const state = speech.get(group.speaker) ?? { buffer: "", window: "" };
      const { event, lastEmittedEndMs: nextLastEmittedEndMs } = buildDeepgramGroupEvent(
        group,
        { isFinal, lastEmittedEndMs, speechFinal, track, utteranceKey },
        state,
      );
      lastEmittedEndMs = nextLastEmittedEndMs;
      speech.set(group.speaker, state);
      if (event) {
        events.push(event);
      }
    }
    if (speechFinal) {
      utteranceKey += 1;
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
  url.searchParams.set("endpointing", String(DEEPGRAM_ENDPOINTING_MS));
  url.searchParams.set("interim_results", "true");
  url.searchParams.set("language", authorization.language ?? "zh-CN");
  url.searchParams.set("model", authorization.model);
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("sample_rate", "24000");
  url.searchParams.set("smart_format", "true");
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
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
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
      const result = deepgramResultSchema.safeParse(JSON.parse(textFrame.data));
      if (!result.success) {
        return;
      }
      for (const transcriptEvent of mapResult(result.data, input.authorization.track)) {
        input.onTranscript(transcriptEvent);
      }
    } catch {
      // Ignore provider control frames and malformed non-transcript messages.
    }
  });
  socket.addEventListener("close", (event) => {
    clearTimeout(drainTimer);
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
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "CloseStream" }));
      }
      socket.close();
    },
    sendPcm: (frame) => {
      if (
        closing ||
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
