import { z } from "zod";
import type { MeetingLibraryItem } from "./meeting-recording";

const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA time zone");

export const meetingLibrarySearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().min(2).max(120),
  timeZone: timeZoneSchema.default("UTC"),
});

export type MeetingLibrarySearchQuery = z.infer<typeof meetingLibrarySearchQuerySchema>;

export type MeetingLibrarySearchMatchKind =
  | "creator"
  | "date"
  | "note"
  | "speaker"
  | "title"
  | "transcript";

export interface MeetingLibrarySearchMatch {
  endMs: number | null;
  kind: MeetingLibrarySearchMatchKind;
  snippet: string;
  startMs: number | null;
}

export interface MeetingLibrarySearchResult extends MeetingLibraryItem {
  match: MeetingLibrarySearchMatch;
}

export interface MeetingLibrarySearchResponse {
  records: MeetingLibrarySearchResult[];
}
