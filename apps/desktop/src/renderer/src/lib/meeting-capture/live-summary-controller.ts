import {
  MEETING_LIVE_SUMMARY_MAX_REQUEST_CHARACTERS,
  MEETING_LIVE_SUMMARY_MAX_TURNS_PER_REQUEST,
  meetingLiveSummarySnapshotSchema,
} from "@app/shared/meeting-live-summary";
import type {
  MeetingLiveSummaryRequest,
  MeetingLiveSummarySnapshot,
  MeetingLiveSummaryTemplate,
  MeetingLiveSummaryTurn,
} from "@app/shared/meeting-live-summary";
import type { LiveTranscriptDraftSnapshot } from "./live-transcript-draft";

export type MeetingLiveSummaryStatus =
  | "disabled"
  | "idle"
  | "waiting"
  | "updating"
  | "ready"
  | "degraded";

export interface MeetingLiveSummaryControllerSnapshot {
  captureId: string | null;
  error: string | null;
  pendingCharacters: number;
  status: MeetingLiveSummaryStatus;
  summary: MeetingLiveSummarySnapshot | null;
}

export interface MeetingLiveSummarySource {
  captureId: string;
  meetingStartedAt: string;
  template: MeetingLiveSummaryTemplate;
  transcript: LiveTranscriptDraftSnapshot;
}

interface MeetingLiveSummaryControllerDependencies {
  immediateCharacters?: number;
  initialDelayMs?: number;
  minCharacters?: number;
  request: (
    request: MeetingLiveSummaryRequest,
    signal: AbortSignal,
  ) => Promise<MeetingLiveSummarySnapshot>;
  retryDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
  updateDelayMs?: number;
}

function initialSnapshot(): MeetingLiveSummaryControllerSnapshot {
  return { captureId: null, error: null, pendingCharacters: 0, status: "idle", summary: null };
}

function turnRange(turn: LiveTranscriptDraftSnapshot["turns"][number], sectionOffsetMs: number) {
  const wordStart = turn.words?.[0]?.startMs;
  const wordEnd = turn.words?.at(-1)?.endMs;
  const relativeStart = turn.startMs ?? wordStart ?? 0;
  const relativeEnd = turn.endMs ?? wordEnd ?? relativeStart + 1;
  const startMs = Math.max(0, sectionOffsetMs + relativeStart);
  return { endMs: Math.max(startMs + 1, sectionOffsetMs + relativeEnd), startMs };
}

export function buildMeetingLiveSummaryTurns(
  snapshot: LiveTranscriptDraftSnapshot,
  meetingStartedAt: string,
): MeetingLiveSummaryTurn[] {
  const meetingStartMs = Date.parse(meetingStartedAt);
  if (!Number.isFinite(meetingStartMs)) {
    return [];
  }
  const sections = new Map(snapshot.sections.map((section) => [section.id, section]));
  return snapshot.turns
    .flatMap((turn) => {
      if (!turn.final || !turn.text.trim()) {
        return [];
      }
      const section = sections.get(turn.sectionId);
      if (!section) {
        return [];
      }
      const sectionStartMs = Date.parse(section.startedAt);
      if (!Number.isFinite(sectionStartMs)) {
        return [];
      }
      return [
        {
          ...turnRange(turn, Math.max(0, sectionStartMs - meetingStartMs)),
          final: true as const,
          id: turn.id,
          speakerDisplayName: turn.speakerDisplayName?.trim() || null,
          speakerKey: turn.speakerKey ?? (turn.track === "microphone" ? "microphone" : "system"),
          text: turn.text.trim(),
          track: turn.track,
        },
      ];
    })
    .toSorted((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
}

function boundedTurns(turns: MeetingLiveSummaryTurn[]): MeetingLiveSummaryTurn[] {
  const selected: MeetingLiveSummaryTurn[] = [];
  let characters = 0;
  for (const turn of turns) {
    if (
      selected.length >= MEETING_LIVE_SUMMARY_MAX_TURNS_PER_REQUEST ||
      characters + turn.text.length > MEETING_LIVE_SUMMARY_MAX_REQUEST_CHARACTERS
    ) {
      break;
    }
    selected.push(turn);
    characters += turn.text.length;
  }
  return selected;
}

function turnFingerprint(turn: MeetingLiveSummaryTurn): string {
  return `${turn.startMs}\0${turn.endMs}\0${turn.speakerKey}\0${turn.text}`;
}

function validateResult(
  result: MeetingLiveSummarySnapshot,
  captureId: string,
  baseRevision: number,
): void {
  if (result.captureId !== captureId || result.revision !== baseRevision + 1) {
    throw new Error("AI 实时总结返回了无效版本");
  }
}

export function createMeetingLiveSummaryController(
  dependencies: MeetingLiveSummaryControllerDependencies,
) {
  const initialDelayMs = dependencies.initialDelayMs ?? 30_000;
  const updateDelayMs = dependencies.updateDelayMs ?? 45_000;
  const retryDelayMs = dependencies.retryDelayMs ?? 60_000;
  const minCharacters = dependencies.minCharacters ?? 120;
  const immediateCharacters = dependencies.immediateCharacters ?? 1200;
  const schedule =
    dependencies.schedule ??
    ((callback: () => void, delayMs: number) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    });
  const listeners = new Set<(snapshot: MeetingLiveSummaryControllerSnapshot) => void>();
  let state = initialSnapshot();
  let source: MeetingLiveSummarySource | null = null;
  let cancelScheduled: (() => void) | null = null;
  let requestAbort: AbortController | null = null;
  let runRequest: (() => Promise<void>) | null = null;
  const acknowledgedTurns = new Map<string, string>();
  let disposed = false;

  const publish = (patch: Partial<MeetingLiveSummaryControllerSnapshot>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      listener(state);
    }
  };

  const cancelTimer = () => {
    cancelScheduled?.();
    cancelScheduled = null;
  };

  const uncoveredTurns = (): MeetingLiveSummaryTurn[] => {
    if (!source) {
      return [];
    }
    const turns = buildMeetingLiveSummaryTurns(source.transcript, source.meetingStartedAt);
    return turns.filter((turn) => acknowledgedTurns.get(turn.id) !== turnFingerprint(turn));
  };

  const scheduleNext = (delayOverride?: number) => {
    if (disposed || cancelScheduled || requestAbort || !source) {
      return;
    }
    const pending = uncoveredTurns();
    const pendingCharacters = pending.reduce((total, turn) => total + turn.text.length, 0);
    publish({ pendingCharacters });
    if (pendingCharacters < minCharacters) {
      if (!state.summary) {
        publish({ status: "waiting" });
      }
      return;
    }
    let delay = delayOverride;
    if (delay === undefined) {
      if (pendingCharacters >= immediateCharacters) {
        delay = 0;
      } else {
        delay = state.summary ? updateDelayMs : initialDelayMs;
      }
    }
    if (!state.summary) {
      publish({ status: "waiting" });
    }
    cancelScheduled = schedule(() => {
      cancelScheduled = null;
      void runRequest?.();
    }, delay);
  };

  function requestIsCurrent(controller: AbortController, captureId: string): boolean {
    return !(controller.signal.aborted || disposed || source?.captureId !== captureId);
  }

  runRequest = async () => {
    if (disposed || requestAbort || !source) {
      return;
    }
    const requestSource = source;
    const baseSnapshot = state.summary;
    const turns = boundedTurns(uncoveredTurns());
    if (turns.length === 0) {
      return;
    }
    const controller = new AbortController();
    requestAbort = controller;
    let nextDelayMs: number | undefined;
    publish({ error: null, status: "updating" });
    try {
      const result = meetingLiveSummarySnapshotSchema.parse(
        await dependencies.request(
          {
            baseSnapshot,
            captureId: requestSource.captureId,
            template: requestSource.template,
            turns,
          },
          controller.signal,
        ),
      );
      if (!requestIsCurrent(controller, requestSource.captureId)) {
        return;
      }
      validateResult(result, requestSource.captureId, baseSnapshot?.revision ?? 0);
      publish({
        error: null,
        pendingCharacters: 0,
        status: "ready",
        summary: result,
      });
      for (const turn of turns) {
        acknowledgedTurns.set(turn.id, turnFingerprint(turn));
      }
      nextDelayMs = undefined;
    } catch (error) {
      if (!requestIsCurrent(controller, requestSource.captureId)) {
        return;
      }
      publish({
        error: error instanceof Error ? error.message : "AI 实时总结暂时不可用",
        status: "degraded",
      });
      nextDelayMs = retryDelayMs;
    } finally {
      if (requestAbort === controller) {
        requestAbort = null;
      }
      if (requestIsCurrent(controller, requestSource.captureId)) {
        scheduleNext(nextDelayMs);
      }
    }
  };

  const resetForSource = (next: MeetingLiveSummarySource | null) => {
    cancelTimer();
    requestAbort?.abort();
    requestAbort = null;
    acknowledgedTurns.clear();
    source = next;
    state = {
      ...initialSnapshot(),
      captureId: next?.captureId ?? null,
      status: next ? "waiting" : "idle",
    };
    for (const listener of listeners) {
      listener(state);
    }
  };

  return {
    dispose: () => {
      disposed = true;
      cancelTimer();
      requestAbort?.abort();
      requestAbort = null;
      listeners.clear();
    },
    getSnapshot: () => state,
    observe: (listener: (snapshot: MeetingLiveSummaryControllerSnapshot) => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    update: (next: MeetingLiveSummarySource | null) => {
      if (!next) {
        resetForSource(null);
        return;
      }
      if (next.captureId === source?.captureId) {
        source = next;
      } else {
        resetForSource(next);
      }
      if (next.transcript.provider && next.transcript.provider !== "deepgram") {
        cancelTimer();
        publish({ error: null, pendingCharacters: 0, status: "disabled", summary: null });
        return;
      }
      if (state.status === "disabled") {
        publish({ status: "waiting" });
      }
      scheduleNext();
    },
  };
}

export type MeetingLiveSummaryController = ReturnType<typeof createMeetingLiveSummaryController>;
