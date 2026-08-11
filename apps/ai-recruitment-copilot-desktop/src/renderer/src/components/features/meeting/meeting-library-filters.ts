import type { MeetingLibraryItem, MeetingProcessingState } from "@arc/shared/meeting-recording";
import { appDayjs } from "@/lib/client/datetime";

export interface MeetingLibraryFilters {
  creatorId: string;
  date: string;
  status: "all" | MeetingProcessingState;
}

export function filterMeetingRecords<T extends MeetingLibraryItem>(
  meetings: T[],
  filters: MeetingLibraryFilters,
): T[] {
  return meetings.filter((meeting) => {
    if (filters.creatorId && meeting.creator.id !== filters.creatorId) {
      return false;
    }
    if (filters.status !== "all" && meeting.processingState !== filters.status) {
      return false;
    }
    if (filters.date && appDayjs(meeting.savedAt)?.format("YYYY-MM-DD") !== filters.date) {
      return false;
    }
    return true;
  });
}
