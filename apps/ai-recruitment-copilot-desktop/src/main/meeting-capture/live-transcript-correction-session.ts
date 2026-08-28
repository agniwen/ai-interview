import type { JsonValue } from "@arc/db-schema/json";
import type { LiveCorrectionBatch, LiveCorrectionEvent } from "@arc/shared/meeting-live-correction";
import { z } from "zod";
import { createLiveTranscriptCorrection } from "./live-transcript-correction";
import type { DashScopeRealtimeWsConnection } from "./live-transcript-ws";

interface Peer {
  baseUrl: string;
  connection: DashScopeRealtimeWsConnection;
  language?: string;
  onCorrection: (event: LiveCorrectionEvent) => void;
  sectionId: string;
  token: string;
  track: "microphone" | "system";
}
const transcriptSchema = z.object({
  item_id: z.string(),
  text: z.string().optional(),
  transcript: z.string().optional(),
  type: z.enum([
    "conversation.item.input_audio_transcription.text",
    "conversation.item.input_audio_transcription.completed",
  ]),
});

export function createLiveTranscriptCorrectionSession(fetch?: typeof globalThis.fetch) {
  const peers = new Map<string, Peer>();
  const worker = createLiveTranscriptCorrection({ fetch });
  let history: { id: string; text: string; corrected?: boolean }[] = [];
  return {
    add: (peer: Peer) => peers.set(peer.sectionId, peer),
    correct: (sectionId: string, batch: LiveCorrectionBatch) => {
      const owner = peers.get(sectionId);
      if (!owner) {
        return;
      }
      const clips = batch.blocks.map((block) => {
        const peer = peers.get(block.sectionId);
        return peer?.track === block.track
          ? (peer.connection.takeCorrectionAudio?.(block.itemId, block.originalText) ?? null)
          : null;
      });
      const lookaheadPeer = batch.lookahead ? peers.get(batch.lookahead.sectionId) : undefined;
      const lookaheadClip =
        batch.lookahead && lookaheadPeer?.track === batch.lookahead.track
          ? (lookaheadPeer.connection.peekCorrectionAudio?.(
              batch.lookahead.itemId,
              batch.lookahead.originalText,
            ) ??
            lookaheadPeer.connection.peekRecentCorrectionAudio?.(1500) ??
            null)
          : null;
      worker.correct({
        baseUrl: `https://${new URL(owner.baseUrl).host}`,
        batch,
        clips,
        getContext: () => {
          const indices = batch.blocks.map((block) =>
            history.findIndex((turn) => turn.id === block.id),
          );
          if (indices.some((index) => index < 0)) {
            return batch.context;
          }
          const before = history
            .slice(Math.max(0, Math.min(...indices) - 5), Math.min(...indices))
            .map((turn) => turn.text);
          const after = history
            .slice(Math.max(...indices) + 1, Math.max(...indices) + 6)
            .map((turn) => turn.text);
          return {
            after: after.length ? after : batch.context.after,
            before: before.length ? before : batch.context.before,
          };
        },
        language: owner.language,
        lookaheadClip,
        onEvent: (event) => {
          if (event.status === "completed") {
            for (const block of event.blocks) {
              if (block.text === null) {
                history = history.filter((turn) => turn.id !== block.id);
                continue;
              }
              const found = history.find((turn) => turn.id === block.id);
              if (found) {
                found.text = block.text.slice(0, 2000);
                found.corrected = true;
              }
            }
            for (const peer of peers.values()) {
              const updates = event.blocks.flatMap((block) => {
                const source = batch.blocks.find((candidate) => candidate.id === block.id);
                if (!source) {
                  return [];
                }
                return [
                  {
                    key:
                      source.sectionId === peer.sectionId
                        ? `item:${source.itemId}`
                        : `peer:${source.id}`,
                    text: block.text,
                  },
                ];
              });
              if (updates.length) {
                peer.connection.sendCorrectionContext?.(updates);
              }
            }
          }
          owner.onCorrection(event);
        },
        token: owner.token,
      });
    },
    observe: (sectionId: string, event: JsonValue) => {
      const parsed = transcriptSchema.safeParse(event);
      if (!parsed.success) {
        return;
      }
      const { item_id: itemId, text, transcript } = parsed.data;
      const id = `${sectionId}:${itemId}`;
      const value = (transcript ?? text ?? "").slice(0, 2000);
      const found = history.find((turn) => turn.id === id);
      if (found) {
        if (!found.corrected) {
          found.text = value;
        }
      } else {
        history = [...history, { id, text: value }].slice(-500);
      }
    },
    remove: (sectionId: string) => {
      worker.cancelSection(sectionId);
      peers.delete(sectionId);
      if (!peers.size) {
        worker.close();
        history = [];
      }
      return peers.size;
    },
  };
}
