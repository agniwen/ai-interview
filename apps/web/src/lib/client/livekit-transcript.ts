import type { ReceivedMessage } from "@livekit/components-react";

const USER_TRANSCRIPT_TYPE = "userTranscript";
const USER_TURN_STARTED_AT = "interview.user_turn_started_at_ms";

function participantIdentity(message: ReceivedMessage): string | undefined {
  return message.from?.identity;
}

function isUserTranscript(message: ReceivedMessage): message is ReceivedMessage & {
  message: string;
  type: typeof USER_TRANSCRIPT_TYPE;
} {
  return message.type === USER_TRANSCRIPT_TYPE;
}

// A full reconnect keeps the hook's old messages. Replace them only after the
// complete server snapshot arrives; text equality cannot distinguish repeated answers.
export function applyReplaySnapshot(messages: ReceivedMessage[]): ReceivedMessage[] {
  const batches = new Map<
    string,
    { start: number; count: number; turns: Map<number, ReceivedMessage> }
  >();
  let latest: { start: number; count: number; turns: Map<number, ReceivedMessage> } | undefined;
  for (const [position, message] of messages.entries()) {
    if (message.type === "chatMessage") {
      continue;
    }
    const { attributes } = message;
    const id = attributes?.["interview.replay_batch"];
    if (!id) {
      continue;
    }
    const index = Number(attributes?.["interview.replay_index"]);
    const count = Number(attributes?.["interview.replay_count"]);
    if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count) {
      continue;
    }
    const batch = batches.get(id) ?? {
      count,
      start: position,
      turns: new Map<number, ReceivedMessage>(),
    };
    batches.set(id, batch);
    if (batch.count !== count) {
      continue;
    }
    batch.turns.set(index, message);
    if (batch.turns.size === count && (!latest || batch.start > latest.start)) {
      latest = batch;
    }
  }
  if (!latest) {
    return messages;
  }
  const snapshot = [...latest.turns.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([, message]) => message);
  const retained = messages.filter(
    (message, position) =>
      message.type === "chatMessage" ||
      (position > latest.start && !message.attributes?.["interview.replay_batch"]),
  );
  return [...snapshot, ...retained];
}

function userTurnStart(message: ReceivedMessage): number | null {
  const raw = message.attributes?.[USER_TURN_STARTED_AT];
  if (!isUserTranscript(message) || !raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function comparableText(message: ReceivedMessage): string {
  return message.message.trim().replace(/[。！？.!?]+$/u, "");
}

// LiveKit sorts by first receipt. The agent publishes an additional final user
// transcript carrying the provider's actual speech-start time, so a late STT
// result can be placed before the reply it prompted without a delay heuristic.
export function orderSessionMessages(input: ReceivedMessage[]): ReceivedMessage[] {
  const messages = applyReplaySnapshot(input);
  const duplicatedStockMessages = new Set<ReceivedMessage>();
  for (const ordered of messages) {
    const startedAt = userTurnStart(ordered);
    if (startedAt === null) {
      continue;
    }
    // RoomIO also sends this turn without its start time. Pair only an equal
    // transcript from the same speaker that was published after speech began.
    const [matchingStock] = messages
      .filter(
        (message) =>
          isUserTranscript(message) &&
          userTurnStart(message) === null &&
          !message.attributes?.["interview.replay_batch"] &&
          !duplicatedStockMessages.has(message) &&
          participantIdentity(message) === participantIdentity(ordered) &&
          message.timestamp >= startedAt &&
          comparableText(message) === comparableText(ordered),
      )
      .toSorted(
        (left, right) =>
          Math.abs(left.timestamp - ordered.timestamp) -
          Math.abs(right.timestamp - ordered.timestamp),
      );
    if (matchingStock) {
      duplicatedStockMessages.add(matchingStock);
    }
  }
  const retained = messages.filter((message) => !duplicatedStockMessages.has(message));
  const replayCount = retained.findIndex(
    (message) => !message.attributes?.["interview.replay_batch"],
  );
  const replayLength = replayCount === -1 ? retained.length : replayCount;
  const live = retained.slice(replayLength);
  live.sort((left, right) => {
    const leftTime = userTurnStart(left) ?? left.timestamp;
    const rightTime = userTurnStart(right) ?? right.timestamp;
    return leftTime - rightTime;
  });
  return [...retained.slice(0, replayLength), ...live];
}
