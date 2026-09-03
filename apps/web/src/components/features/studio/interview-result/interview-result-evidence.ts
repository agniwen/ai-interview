import type { EvidenceQuote } from "../interviews/interview-detail/evaluation-results";

export function createSelectedEvidenceAction(conversationId: string, evidence: EvidenceQuote) {
  return {
    evidence: {
      conversationId,
      timeInCallSecs: evidence.timeInCallSecs ?? null,
      turnIndex: evidence.turnIndex ?? null,
    },
    type: "selectedEvidenceChanged" as const,
  };
}
