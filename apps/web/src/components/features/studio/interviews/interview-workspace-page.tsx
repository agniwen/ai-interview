import { useNavigate, useSearch } from "@tanstack/react-router";
import type { StudioCalendarCandidate, StudioCalendarEvent } from "@app/shared/studio-calendar";
import { PageHeader } from "../page-header";
import { StudioCalendarPage } from "../calendar/studio-calendar-page";
import { studioCalendarEventDestination } from "../calendar/studio-calendar-navigation";
import { InterviewManagementPage } from "./interview-management-page";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { resolveInterviewWorkspaceView } from "@/lib/client/studio-interviews-search";

export function InterviewWorkspacePage() {
  const slug = useWorkspaceSlug();
  const navigate = useNavigate({ from: "/w/$slug/studio/interviews" });
  const search = useSearch({ from: "/w/$slug/studio/interviews" });
  const canViewTable = useHasPermission("page", "interviews");
  const canViewCalendar = useHasPermission("page", "calendar");
  const view = resolveInterviewWorkspaceView(search.view, canViewTable, canViewCalendar);

  function openAgendaEvent(event: StudioCalendarEvent, candidate: StudioCalendarCandidate) {
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
  }

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader title="面试管理" />
      <Tabs
        value={view}
        onValueChange={(value) => {
          if (value !== "table" && value !== "list" && value !== "calendar") {
            return;
          }
          void navigate({
            replace: true,
            resetScroll: false,
            search: (previous) => ({ ...previous, view: value }),
          });
        }}
      >
        <TabsList aria-label="面试视图">
          {canViewTable ? <TabsTab value="table">表格视图</TabsTab> : null}
          {canViewCalendar ? <TabsTab value="list">列表视图</TabsTab> : null}
          {canViewCalendar ? <TabsTab value="calendar">日历视图</TabsTab> : null}
        </TabsList>
        <TabsPanel value="table">
          {view === "table" ? <InterviewManagementPage embedded /> : null}
        </TabsPanel>
        <TabsPanel value="list">
          {view === "list" ? (
            <StudioCalendarPage mode="list" slug={slug} onOpenAgendaEvent={openAgendaEvent} />
          ) : null}
        </TabsPanel>
        <TabsPanel value="calendar">
          {view === "calendar" ? (
            <StudioCalendarPage mode="calendar" slug={slug} onOpenAgendaEvent={openAgendaEvent} />
          ) : null}
        </TabsPanel>
      </Tabs>
    </div>
  );
}
