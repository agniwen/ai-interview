import type { PersistedInterviewTurn } from "@arc/db-schema/interview-session";

const TRAILING_PUNCTUATION = /[\s,.;:!?，。；：！？、]$/;
const LEADING_PUNCTUATION = /^[\s,.;:!?，。；：！？、]/;
const CJK_EDGE = /[\u3400-\u9FFF\u3040-\u30FF]$/;
const CJK_START = /^[\u3400-\u9FFF\u3040-\u30FF]/;

export interface DisplayInterviewTurn extends PersistedInterviewTurn {
  rawTurnIndexes: number[];
}

export interface InterviewTranscriptTurnStats {
  agentTurnCount: number;
  turnCount: number;
  userTurnCount: number;
}

export function joinTranscriptText(left: string, right: string): string {
  const next = right.trim();
  if (!next) {
    return left;
  }
  if (!left) {
    return next;
  }
  if (
    TRAILING_PUNCTUATION.test(left) ||
    LEADING_PUNCTUATION.test(next) ||
    (CJK_EDGE.test(left) && CJK_START.test(next))
  ) {
    return `${left}${next}`;
  }
  return `${left} ${next}`;
}

export function coalescePersistedInterviewTurns(
  turns: PersistedInterviewTurn[],
): DisplayInterviewTurn[] {
  const result: DisplayInterviewTurn[] = [];

  for (const [index, turn] of turns.entries()) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.role === "user" &&
      turn.role === "user" &&
      previous.conversationId === turn.conversationId
    ) {
      result[result.length - 1] = {
        ...previous,
        message: joinTranscriptText(previous.message, turn.message),
        rawTurnIndexes: [...previous.rawTurnIndexes, index + 1],
      };
      continue;
    }

    result.push({
      ...turn,
      rawTurnIndexes: [index + 1],
    });
  }

  return result;
}

export function countDisplayInterviewTurns(
  turns: PersistedInterviewTurn[],
): InterviewTranscriptTurnStats {
  const displayTurns = coalescePersistedInterviewTurns(turns);
  return {
    agentTurnCount: displayTurns.filter((turn) => turn.role === "agent").length,
    turnCount: displayTurns.length,
    userTurnCount: displayTurns.filter((turn) => turn.role === "user").length,
  };
}
