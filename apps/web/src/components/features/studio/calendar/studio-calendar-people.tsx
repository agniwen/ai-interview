import type { StudioCalendarCreator, StudioCalendarEvent } from "@app/shared/studio-calendar";
import { PersonAvatar } from "./interview-evaluation-hover-card";

// 面试管理议程里的人员单元格：创建人与面试官。/ People cells in the interview agenda.

export function uniqueText(values: (string | null | undefined)[]): string {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].join("、");
}

/** 一场面试里所有候选人的创建人，按 id 去重。/ Distinct creators of the event's candidates. */
export function calendarEventCreators(event: StudioCalendarEvent): StudioCalendarCreator[] {
  const creators = new Map<string, StudioCalendarCreator>();
  for (const candidate of event.candidates) {
    if (candidate.creator && !creators.has(candidate.creator.id)) {
      creators.set(candidate.creator.id, candidate.creator);
    }
  }
  return [...creators.values()];
}

export function CalendarCreators({ creators }: { creators: StudioCalendarCreator[] }) {
  if (creators.length === 0) {
    return <span className="truncate">—</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-1">
        {creators.slice(0, 3).map((creator) => (
          <span className="rounded-full ring-2 ring-background" key={creator.id}>
            <PersonAvatar avatarUrl={creator.avatarUrl} seed={creator.id} />
          </span>
        ))}
      </span>
      <span className="truncate">{uniqueText(creators.map((creator) => creator.name))}</span>
    </span>
  );
}

export function CalendarInterviewers({ event }: { event: StudioCalendarEvent }) {
  if (event.kind === "ai") {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <PersonAvatar avatarUrl={null} kind="ai" seed="ai" />
        <span className="truncate">AI 面试官</span>
      </span>
    );
  }
  if (event.interviewers.length === 0) {
    return <span className="truncate">面试官待确认</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-1">
        {event.interviewers.slice(0, 3).map((interviewer) => (
          <span className="rounded-full ring-2 ring-background" key={interviewer.id}>
            <PersonAvatar avatarUrl={interviewer.avatarUrl} seed={interviewer.id} />
          </span>
        ))}
      </span>
      <span className="truncate">
        {uniqueText(event.interviewers.map((interviewer) => interviewer.name))}
      </span>
    </span>
  );
}
