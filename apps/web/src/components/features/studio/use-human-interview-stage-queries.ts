import { useQuery } from "@tanstack/react-query";
import { listHumanInterviewMeetings, listHumanInterviewRounds } from "@/lib/client/api";
import { humanInterviewKeys } from "@/lib/client/api/query-keys";

export function useHumanInterviewStageQueries(
  slug: string,
  candidateId: string,
  pollMeetings = false,
) {
  const roundsQuery = useQuery({
    queryFn: () => listHumanInterviewRounds(slug, candidateId),
    queryKey: humanInterviewKeys.rounds(slug, candidateId),
  });
  const meetingsQuery = useQuery({
    queryFn: () => listHumanInterviewMeetings(slug, { interviewRecordId: candidateId }),
    queryKey: humanInterviewKeys.meetings(slug, candidateId),
    refetchInterval: (query) =>
      pollMeetings &&
      query.state.data?.some(
        (meeting) => meeting.status === "scheduled" || meeting.status === "in_progress",
      )
        ? 10_000
        : false,
    refetchIntervalInBackground: false,
  });
  const rounds = roundsQuery.data ?? [];
  const meetings = meetingsQuery.data ?? [];
  const queries = [roundsQuery, meetingsQuery];
  const initialError = queries.find((query) => query.isLoadingError)?.error;
  const hasData = queries.every((query) => query.data !== undefined);
  return { hasData, initialError, meetings, meetingsQuery, rounds, roundsQuery };
}
