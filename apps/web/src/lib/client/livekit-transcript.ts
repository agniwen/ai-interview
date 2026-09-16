import type { ReceivedMessage } from "@livekit/components-react";
import { joinTranscriptText } from "@app/shared/interview-transcript-turns";

const USER_TRANSCRIPT_TYPE = "userTranscript";

function participantIdentity(message: ReceivedMessage): string | undefined {
  return message.from?.identity;
}

function isUserTranscript(message: ReceivedMessage): message is ReceivedMessage & {
  message: string;
  type: typeof USER_TRANSCRIPT_TYPE;
} {
  return message.type === USER_TRANSCRIPT_TYPE;
}

function shouldMergeUserTranscript(previous: ReceivedMessage, next: ReceivedMessage): boolean {
  return (
    isUserTranscript(previous) &&
    isUserTranscript(next) &&
    participantIdentity(previous) === participantIdentity(next)
  );
}

// A full reconnect keeps the hook's old messages. Replace them only after the
// complete server snapshot arrives; text equality cannot distinguish repeated answers.
function applyReplaySnapshot(messages: ReceivedMessage[]): ReceivedMessage[] {
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

export function coalesceSessionMessages(input: ReceivedMessage[]): ReceivedMessage[] {
  const messages = applyReplaySnapshot(input);
  if (messages.length < 2) {
    return messages;
  }

  let merged = false;
  const result: ReceivedMessage[] = [];

  for (const message of messages) {
    const previous = result.at(-1);
    if (previous && shouldMergeUserTranscript(previous, message)) {
      result[result.length - 1] = {
        ...previous,
        message: joinTranscriptText(previous.message, message.message),
      };
      merged = true;
      continue;
    }
    result.push(message);
  }

  return merged ? result : messages;
}
