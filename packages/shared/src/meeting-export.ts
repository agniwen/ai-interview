import { z } from "zod";
import type {
  MeetingIntelligencePayload,
  MeetingIntelligenceTemplate,
} from "./meeting-intelligence";

export const MEETING_EXPORT_FORMATS = ["audio", "markdown", "txt", "srt", "json"] as const;
export const meetingExportFormatSchema = z.enum(MEETING_EXPORT_FORMATS);
export type MeetingExportFormat = z.infer<typeof meetingExportFormatSchema>;
export type MeetingTextExportFormat = Exclude<MeetingExportFormat, "audio">;
export const MEETING_AUDIO_EXPORT_TRACKS = ["playback", "microphone", "system"] as const;
export const meetingAudioExportTrackSchema = z.enum(MEETING_AUDIO_EXPORT_TRACKS);
export type MeetingAudioExportTrack = z.infer<typeof meetingAudioExportTrackSchema>;

export interface MeetingExportTurn {
  endMs: number;
  id: string;
  sequence: number;
  speaker: string;
  startMs: number;
  text: string;
  track: "local" | "remote";
}

export interface MeetingExportSnapshot {
  intelligence: {
    content: MeetingIntelligencePayload;
    createdAt: string;
    id: string;
    revision: number;
    template: MeetingIntelligenceTemplate;
    transcriptRevisionId: string;
  } | null;
  meeting: {
    id: string;
    savedAt: string;
    startedAt: string;
    title: string;
  };
  transcript: {
    createdAt: string;
    id: string;
    kind: "final" | "human";
    language: string | null;
    revision: number;
  };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function formatMeetingExportTimestamp(milliseconds: number, format: "srt" | "text"): string {
  const safeMs = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const remainder = safeMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${format === "srt" ? "," : "."}${pad(remainder, 3)}`;
}

function transcriptLabel(snapshot: MeetingExportSnapshot): string {
  const { transcript } = snapshot;
  return `${transcript.revision} (${transcript.id}, ${transcript.kind})`;
}

function intelligenceLabel(snapshot: MeetingExportSnapshot): string {
  const { intelligence } = snapshot;
  return intelligence
    ? `${intelligence.revision} (${intelligence.id}, ${intelligence.template})`
    : "none";
}

export function formatMeetingExportHeader(
  format: MeetingTextExportFormat,
  snapshot: MeetingExportSnapshot,
): string {
  if (format === "srt") {
    return "";
  }
  if (format === "json") {
    return `${JSON.stringify({
      intelligence: snapshot.intelligence,
      meeting: snapshot.meeting,
      transcript: snapshot.transcript,
    }).slice(0, -1)},"turns":[`;
  }
  if (format === "markdown") {
    const intelligence = snapshot.intelligence
      ? `\n## Meeting Intelligence\n\n\`\`\`json\n${JSON.stringify(snapshot.intelligence.content, null, 2)}\n\`\`\`\n`
      : "";
    return `# ${snapshot.meeting.title}\n\n- Meeting ID: ${snapshot.meeting.id}\n- Saved at: ${snapshot.meeting.savedAt}\n- Transcript revision: ${transcriptLabel(snapshot)}\n- Meeting Intelligence revision: ${intelligenceLabel(snapshot)}\n${intelligence}\n## Transcript\n\n`;
  }
  return `${snapshot.meeting.title}\nMeeting ID: ${snapshot.meeting.id}\nSaved at: ${snapshot.meeting.savedAt}\nTranscript revision: ${transcriptLabel(snapshot)}\nMeeting Intelligence revision: ${intelligenceLabel(snapshot)}\n\n`;
}

export function formatMeetingExportTurn(
  format: MeetingTextExportFormat,
  turn: MeetingExportTurn,
  first: boolean,
): string {
  if (format === "json") {
    return `${first ? "" : ","}${JSON.stringify(turn)}`;
  }
  if (format === "srt") {
    const speaker = turn.speaker.replaceAll(/\s+/g, " ").trim();
    const text = turn.text.replaceAll(/\r\n?/g, "\n").replaceAll(/\n[\t ]*\n+/g, "\n");
    return `${turn.sequence + 1}\n${formatMeetingExportTimestamp(turn.startMs, "srt")} --> ${formatMeetingExportTimestamp(turn.endMs, "srt")}\n${speaker}: ${text}\n\n`;
  }
  const line = `[${formatMeetingExportTimestamp(turn.startMs, "text")} - ${formatMeetingExportTimestamp(turn.endMs, "text")}] ${turn.speaker}: ${turn.text}`;
  return format === "markdown" ? `<!-- turn:${turn.id} -->\n${line}\n\n` : `${line}\n`;
}

export function formatMeetingExportFooter(format: MeetingTextExportFormat): string {
  return format === "json" ? "]}\n" : "";
}
