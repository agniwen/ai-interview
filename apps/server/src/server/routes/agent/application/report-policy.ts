import {
  mergeInterviewQuestionOutcome,
  parseInterviewDataCollectionResults,
} from "@app/shared/interview/question-outcomes";
import type { JsonObject } from "@app/db-schema/json";
import type { ReportTranscript } from "../route";
interface ReportEvidence {
  metadata?: JsonObject | null;
  transcript: ReportTranscript;
  dataCollectionResults?: unknown;
}
export function resolveReportUpdate(
  existing: (ReportEvidence & { startedAt: Date | null }) | null | undefined,
  incoming: ReportEvidence & { startedAt?: string | null },
) {
  const previous = existing?.transcript ?? [];
  const previousSession = existing?.metadata?.agentSessionId;
  const incomingSession = incoming.metadata?.agentSessionId;
  const differentSession = Boolean(previousSession && previousSession !== incomingSession);
  const differentStart = Boolean(
    existing?.startedAt &&
    incoming.startedAt &&
    existing.startedAt.getTime() !== new Date(incoming.startedAt).getTime(),
  );
  const extendsTranscript = previous.every((turn, index) => {
    const next = incoming.transcript[index];
    return (
      next?.role === turn.role &&
      next.message === turn.message &&
      next.timeInCallSecs === turn.timeInCallSecs
    );
  });
  let results = parseInterviewDataCollectionResults(existing?.dataCollectionResults) ?? {
    questions: [],
    schemaVersion: 2 as const,
  };
  for (const outcome of parseInterviewDataCollectionResults(incoming.dataCollectionResults)
    ?.questions ?? []) {
    const old = results.questions.find((question) => question.questionId === outcome.questionId);
    // A shutdown report's missing-question markers are not revisions of an answer.
    if (
      old &&
      ["answered", "insufficient", "skipped"].includes(old.status) &&
      ["unasked", "interrupted"].includes(outcome.status)
    ) {
      continue;
    }
    results = mergeInterviewQuestionOutcome(results, outcome);
  }
  return {
    accepted: !differentSession && !differentStart && extendsTranscript,
    dataCollectionResults: results,
    transcriptChanged: JSON.stringify(previous) !== JSON.stringify(incoming.transcript),
  };
}
