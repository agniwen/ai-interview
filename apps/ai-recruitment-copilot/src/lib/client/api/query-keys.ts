import type { QueryClient } from "@tanstack/react-query";

export const chatConversationKeys = {
  all: ["chat-conversations"] as const,
  list: (slug: string) => ["chat-conversations", slug] as const,
};

export const humanInterviewKeys = {
  meetings: (slug: string, candidateId: string) =>
    ["human-interview-meetings", slug, candidateId] as const,
  rounds: (slug: string, candidateId: string) =>
    ["human-interview-rounds", slug, candidateId] as const,
  studioResumes: () => ["studio-resumes"] as const,
};

export const studioCalendarKeys = {
  aiEventPreview: (slug: string, roundId: string, conversationId: string | null) =>
    ["studio-calendar", slug, "ai-event-preview", roundId, conversationId] as const,
  range: (slug: string, start: string, end: string) =>
    ["studio-calendar", slug, start, end] as const,
};

export const studioResumeKeys = {
  metrics: (slug: string, scope: "team" | "personal" = "team") =>
    ["studio-resume-metrics", slug, scope] as const,
};

type QueryInvalidator = Pick<QueryClient, "invalidateQueries">;

export async function invalidateHumanInterviewCandidateQueries(
  queryClient: QueryInvalidator,
  {
    candidateId,
    slug,
  }: {
    candidateId: string;
    slug: string;
  },
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: humanInterviewKeys.rounds(slug, candidateId),
    }),
    queryClient.invalidateQueries({
      queryKey: humanInterviewKeys.meetings(slug, candidateId),
    }),
    queryClient.invalidateQueries({ queryKey: humanInterviewKeys.studioResumes() }),
  ]);
}
