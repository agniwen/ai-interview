import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import type { StudioCalendarCandidate, StudioCalendarEvent } from "@app/shared/studio-calendar";
import { studioCalendarEventDestination } from "@/components/features/studio/calendar/studio-calendar-navigation";
import { StudioCalendarPage } from "@/components/features/studio/calendar/studio-calendar-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

function StudioCalendarRoute() {
  const navigate = useNavigate({ from: "/w/$slug/studio/calendar" });
  const { slug } = useParams({ from: "/w/$slug/studio/calendar" });
  const openAgendaEvent = useCallback(
    (event: StudioCalendarEvent, candidate: StudioCalendarCandidate) => {
      const destination = studioCalendarEventDestination(event, candidate);
      if (!destination) {
        return;
      }
      if (destination.kind === "interviewer_meeting") {
        void navigate({
          params: { inviteToken: destination.inviteToken },
          to: "/human-interview/interviewer/$inviteToken",
        });
        return;
      }
      void navigate({
        params: { recordId: destination.recordId, slug },
        search: { tab: destination.tab },
        state: (previous) => ({ ...previous, fromStudioCalendar: true }),
        to: "/w/$slug/studio/resumes/$recordId",
      });
    },
    [navigate, slug],
  );

  return <StudioCalendarPage onOpenAgendaEvent={openAgendaEvent} slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/calendar")({
  head: () => ({
    meta: [{ title: formatDocumentTitle("日程管理") }],
  }),
  component: StudioCalendarRoute,
});
