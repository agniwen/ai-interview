import type { LiveCorrectionBatch, LiveCorrectionEvent } from "@app/shared/meeting-live-correction";
import type {
  MeetingLiveTranscriptDraft,
  MeetingLiveTranscriptTrack,
} from "@app/shared/meeting-transcription";
import type {
  LiveTranscriptConnection,
  LiveTranscriptDraftSnapshot,
  LiveTranscriptDraftTurn,
  LiveTranscriptEvent,
} from "./live-transcript-draft";

const MAX_DRAFT_TURN_CHARS = 10_000;

const clearFlags = (turns: LiveTranscriptDraftTurn[], ids: Set<string>) =>
  turns.map((turn) => (ids.has(turn.id) ? { ...turn, correcting: false } : turn));

/** Count visible final blocks across both tracks and send one capture-wide batch. */
export function createLiveTranscriptCorrectionBatches() {
  const requested = new Set<string>();
  const pending = new Map<string, LiveCorrectionBatch>();

  return {
    apply: (turns: LiveTranscriptDraftTurn[], event: LiveCorrectionEvent) => {
      const batch = pending.get(event.batchId);
      if (!batch) {
        return turns;
      }
      pending.delete(event.batchId);
      const ids = new Set(batch.blocks.map((block) => block.id));
      // Validate the whole batch before replacing any block. Late/manual/trimmed edits win.
      const canApply =
        event.status === "completed" &&
        event.blocks.length === batch.blocks.length &&
        batch.blocks.every((block, index) => {
          const current = turns.find((turn) => turn.id === block.id);
          return (
            current?.final &&
            !current.correctionModel &&
            current.text === block.originalText &&
            event.blocks[index]?.id === block.id
          );
        });
      if (!canApply || event.status !== "completed") {
        return clearFlags(turns, ids);
      }
      return turns.flatMap((turn) => {
        const corrected = event.blocks.find((block) => block.id === turn.id);
        if (!corrected) {
          return [turn];
        }
        if (corrected.text === null) {
          return [];
        }
        return [
          {
            ...turn,
            correcting: false,
            correctionModel: event.model,
            originalText: turn.text,
            text: corrected.text,
          },
        ];
      });
    },
    cancelSection: (turns: LiveTranscriptDraftTurn[], sectionId: string | null) => {
      const ids = new Set<string>();
      for (const [id, batch] of pending) {
        if (batch.blocks.some((block) => block.sectionId === sectionId)) {
          pending.delete(id);
          for (const block of batch.blocks) {
            ids.add(block.id);
          }
        }
      }
      return clearFlags(turns, ids);
    },
    clear: () => {
      requested.clear();
      pending.clear();
    },
    isIdle: () => pending.size === 0,
    request: (
      turns: LiveTranscriptDraftTurn[],
      targets: Record<
        MeetingLiveTranscriptTrack,
        { connection: LiveTranscriptConnection | null; sectionId: string | null }
      >,
      onPending: (ids: string[], correcting: boolean) => void,
      options: { force?: boolean } = {},
    ) => {
      const retainedIds = new Set(turns.map((turn) => turn.id));
      for (const id of requested) {
        if (!retainedIds.has(id)) {
          requested.delete(id);
        }
      }
      const eligible = turns.filter((turn) => {
        const target = targets[turn.track];
        return (
          turn.final &&
          turn.text.trim() &&
          !turn.correctionModel &&
          !requested.has(turn.id) &&
          target.sectionId === turn.sectionId &&
          target.connection?.correct
        );
      });
      while (eligible.length > 0) {
        const selectedCount = Math.min(3, eligible.length);
        if (!options.force && selectedCount < 3) {
          break;
        }
        const selected = eligible.slice(0, selectedCount);
        const first = turns.indexOf(selected[0]);
        const lastSelected = selected.at(-1);
        if (!lastSelected) {
          break;
        }
        const last = turns.indexOf(lastSelected);
        const rightLookahead = turns.slice(last + 1).find((turn) => turn.text.trim().length > 0);
        const hasRightLookahead = Boolean(rightLookahead);
        if (!options.force && !hasRightLookahead) {
          break;
        }
        eligible.splice(0, selectedCount);
        const batch: LiveCorrectionBatch = {
          batchId: crypto.randomUUID(),
          blocks: selected.map((turn) => ({
            id: turn.id,
            itemId: turn.id.slice(turn.sectionId.length + 1),
            originalText: turn.text,
            sectionId: turn.sectionId,
            track: turn.track,
          })),
          context: {
            after: turns.slice(last + 1, last + 6).map((turn) => turn.text.slice(0, 2000)),
            before: turns
              .slice(Math.max(0, first - 5), first)
              .map((turn) => turn.text.slice(0, 2000)),
          },
        };
        if (rightLookahead) {
          batch.lookahead = {
            id: rightLookahead.id,
            itemId: rightLookahead.id.slice(rightLookahead.sectionId.length + 1),
            originalText: rightLookahead.text,
            sectionId: rightLookahead.sectionId,
            track: rightLookahead.track,
          };
        }
        const ids = selected.map((turn) => turn.id);
        for (const id of ids) {
          requested.add(id);
        }
        pending.set(batch.batchId, batch);
        onPending(ids, true);
        const correct = targets[selected[0].track].connection?.correct;
        if (!correct || correct(batch) === false) {
          pending.delete(batch.batchId);
          onPending(ids, false);
        }
      }
    },
  };
}

export function createDurableLiveTranscriptDraft(
  snapshot: LiveTranscriptDraftSnapshot,
  captureId?: string,
): MeetingLiveTranscriptDraft | null {
  if (!snapshot.captureId || (captureId && snapshot.captureId !== captureId)) {
    return null;
  }
  const turns = snapshot.turns.filter((turn) => turn.text.trim().length > 0);
  const referencedSectionIds = new Set(turns.map((turn) => turn.sectionId));
  const durable: MeetingLiveTranscriptDraft = {
    capturedAt: new Date().toISOString(),
    droppedAudioMs: snapshot.droppedAudioMs,
    droppedPcmFrames: snapshot.droppedPcmFrames,
    error: snapshot.error,
    sections: snapshot.sections.filter((section) => referencedSectionIds.has(section.id)),
    // In-flight UI state must never survive recording recovery.
    turns: turns.map(({ correcting: _correcting, ...turn }) => ({
      ...turn,
      text: turn.text.trim(),
    })),
  };
  if (snapshot.language) {
    durable.language = snapshot.language;
  }
  if (snapshot.model) {
    durable.model = snapshot.model;
  }
  if (snapshot.provider) {
    durable.provider = snapshot.provider;
  }
  return durable;
}

export function applyLiveTranscriptCorrection(
  current: LiveTranscriptDraftTurn | undefined,
  event: LiveTranscriptEvent,
): LiveTranscriptDraftTurn | null {
  if (event.type === "correction-finished") {
    return current?.correcting ? { ...current, correcting: false } : null;
  }
  // Compare-and-set: never revive trimmed turns or replace a newer/manual edit.
  if (!current?.final || current.correctionModel || current.text !== event.originalText) {
    return null;
  }
  if (event.type === "correction-started") {
    return current.correcting ? null : { ...current, correcting: true };
  }
  if (!event.text.trim() || event.text.length > 10_000 || !event.correctionModel) {
    return null;
  }
  return {
    ...current,
    correcting: false,
    correctionModel: event.correctionModel,
    originalText: current.text,
    text: event.text,
  };
}

export function appendLiveTranscriptTurn(
  previous: LiveTranscriptDraftTurn[],
  track: MeetingLiveTranscriptTrack,
  sectionId: string,
  event: LiveTranscriptEvent,
): LiveTranscriptDraftTurn[] | null {
  const id = `${sectionId}:${event.itemId}`;
  const index = previous.findIndex((turn) => turn.id === id);
  const turns = [...previous];
  if (["corrected", "correction-started", "correction-finished"].includes(event.type)) {
    const corrected = applyLiveTranscriptCorrection(turns[index], event);
    if (!corrected) {
      return null;
    }
    turns[index] = corrected;
  } else if (index === -1) {
    const turn: LiveTranscriptDraftTurn = {
      final: event.type === "completed",
      id,
      sectionId,
      text: event.text.slice(0, MAX_DRAFT_TURN_CHARS),
      track,
    };
    if (event.endMs !== undefined) {
      turn.endMs = event.endMs;
    }
    if (event.startMs !== undefined) {
      turn.startMs = event.startMs;
    }
    if (event.speakerDisplayName !== undefined) {
      turn.speakerDisplayName = event.speakerDisplayName;
    }
    if (event.speakerKey) {
      turn.speakerKey = event.speakerKey;
    }
    if (event.words) {
      turn.words = event.words;
    }
    turns.push(turn);
  } else {
    const current = turns[index];
    if (!current || current.correctionModel) {
      return null;
    }
    const updated: LiveTranscriptDraftTurn = {
      ...current,
      final: event.type === "completed",
      text: (event.type === "delta" ? `${current.text}${event.text}` : event.text).slice(
        0,
        MAX_DRAFT_TURN_CHARS,
      ),
    };
    if (event.endMs !== undefined) {
      updated.endMs = event.endMs;
    }
    if (event.startMs !== undefined) {
      updated.startMs = event.startMs;
    }
    if (event.speakerDisplayName !== undefined) {
      updated.speakerDisplayName = event.speakerDisplayName;
    }
    if (event.speakerKey) {
      updated.speakerKey = event.speakerKey;
    }
    if (event.words) {
      updated.words = event.words;
    }
    turns[index] = updated;
  }
  return turns;
}
