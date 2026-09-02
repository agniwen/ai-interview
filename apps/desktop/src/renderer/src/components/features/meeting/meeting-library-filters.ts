import type {
  MeetingLibraryItem,
  MeetingProcessingState,
  TrashedMeetingItem,
} from "@app/shared/meeting-recording";
import { meetingDisplayTitle } from "@app/shared/utils/time";
import { appDayjs } from "@/lib/client/datetime";

export interface MeetingLibraryFilters {
  date: string;
  status: "all" | MeetingProcessingState;
}

export function filterMeetingRecords<T extends MeetingLibraryItem>(
  meetings: T[],
  filters: MeetingLibraryFilters,
): T[] {
  return meetings.filter((meeting) => {
    if (filters.status !== "all" && meeting.processingState !== filters.status) {
      return false;
    }
    if (filters.date && appDayjs(meeting.savedAt)?.format("YYYY-MM-DD") !== filters.date) {
      return false;
    }
    return true;
  });
}

function compareArchivedNewestFirst(left: TrashedMeetingItem, right: TrashedMeetingItem): number {
  const byTrashedAt = Date.parse(right.trashedAt) - Date.parse(left.trashedAt);
  if (byTrashedAt !== 0) {
    return byTrashedAt;
  }
  return right.id.localeCompare(left.id);
}

export function filterArchivedMeetings(
  meetings: TrashedMeetingItem[],
  query: string,
): TrashedMeetingItem[] {
  const normalized = query.trim().toLowerCase();
  const matched = normalized
    ? meetings.filter((meeting) => {
        const title = meetingDisplayTitle(meeting.title).toLowerCase();
        return title.includes(normalized) || meeting.title.toLowerCase().includes(normalized);
      })
    : meetings;
  return [...matched].toSorted(compareArchivedNewestFirst);
}

export interface PaginatedRecords<T> {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
}

export function paginateRecords<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginatedRecords<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: currentPage,
    total,
    totalPages,
  };
}
