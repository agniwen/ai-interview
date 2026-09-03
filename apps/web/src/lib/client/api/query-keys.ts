import type { QueryClient } from "@tanstack/react-query";

export const chatConversationKeys = {
  all: ["chat-conversations"] as const,
  list: (slug: string) => ["chat-conversations", slug] as const,
};

export const humanInterviewKeys = {
  meetings: (slug: string, candidateId: string) =>
    ["human-interview-meetings", slug, candidateId] as const,
  meetingsByWorkspace: (slug: string) => ["human-interview-meetings", slug] as const,
  rounds: (slug: string, candidateId: string) =>
    ["human-interview-rounds", slug, candidateId] as const,
  roundsByWorkspace: (slug: string) => ["human-interview-rounds", slug] as const,
  studioResumes: () => ["studio-resumes"] as const,
};

export const interviewNotificationKeys = {
  recipients: (slug: string, candidateId: string) =>
    ["interview-notification-recipients", slug, candidateId] as const,
  workspaceMembers: (slug: string) => ["workspace-members", slug] as const,
};

export const jobDescriptionKeys = {
  all: ["job-descriptions"] as const,
  recruiting: (slug: string) => [...jobDescriptionKeys.all, "recruiting", slug] as const,
  recruitingFilterOptions: (slug: string) =>
    [...jobDescriptionKeys.all, "recruiting-filter-options", slug] as const,
};

export const studioCalendarKeys = {
  aiEventPreview: (slug: string, roundId: string, conversationId: string | null) =>
    ["studio-calendar", slug, "ai-event-preview", roundId, conversationId] as const,
  range: (slug: string, start: string, end: string) =>
    [...studioCalendarKeys.ranges(slug), start, end] as const,
  ranges: (slug: string) => ["studio-calendar", slug, "ranges"] as const,
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
    queryClient.invalidateQueries({ queryKey: studioCalendarKeys.ranges(slug) }),
  ]);
}

export async function invalidateHumanInterviewWorkspaceQueries(
  queryClient: QueryInvalidator,
  { slug }: { slug: string },
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: humanInterviewKeys.roundsByWorkspace(slug) }),
    queryClient.invalidateQueries({ queryKey: humanInterviewKeys.meetingsByWorkspace(slug) }),
    queryClient.invalidateQueries({ queryKey: humanInterviewKeys.studioResumes() }),
    queryClient.invalidateQueries({ queryKey: studioCalendarKeys.ranges(slug) }),
  ]);
}
