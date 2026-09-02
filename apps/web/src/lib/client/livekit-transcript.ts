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

export function coalesceSessionMessages(messages: ReceivedMessage[]): ReceivedMessage[] {
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
