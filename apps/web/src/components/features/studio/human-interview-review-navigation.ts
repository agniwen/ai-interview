import type { HumanInterviewRoundRecord } from "@app/shared/studio-pipeline-stages";

type ReviewRound = Pick<
  HumanInterviewRoundRecord,
  "id" | "createdAt" | "sortOrder" | "label" | "status" | "evaluationStatus"
>;

function compareRounds(a: ReviewRound, b: ReviewRound) {
  return a.createdAt.localeCompare(b.createdAt) || a.sortOrder - b.sortOrder;
}

export function getHumanInterviewReviewNavigation<T extends ReviewRound>(
  rounds: T[],
  viewedRoundId?: string | null,
) {
  const [latestRound] = rounds
    .filter((round) => round.status !== "cancelled" && round.evaluationStatus !== "not_started")
    .toSorted((a, b) => compareRounds(b, a));
  const viewedRound = rounds.find((round) => round.id === viewedRoundId);
  return {
    latestRound,
    newerRound:
      latestRound && viewedRound && compareRounds(latestRound, viewedRound) > 0
        ? latestRound
        : undefined,
  };
}
