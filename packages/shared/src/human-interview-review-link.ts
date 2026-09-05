/** A system review link contains identifiers only, never an invitation credential. */
export function humanInterviewReviewPath(input: {
  slug: string;
  candidateId: string;
  roundId: string;
}): string {
  const search = new URLSearchParams({ reviewRoundId: input.roundId, tab: "human-interview" });
  return `/w/${encodeURIComponent(input.slug)}/studio/resumes/${encodeURIComponent(input.candidateId)}?${search}`;
}
