import type {
  CreateMeetingNoteInput,
  MeetingDetail,
  MeetingLibraryItem,
  MeetingNote,
  MeetingPlaybackAuthorization,
  MeetingShareSettings,
  UpdateMeetingNoteInput,
  UpdateMeetingShareInput,
} from "@arc/shared/meeting-recording";
import { apiJson } from "./rpc-fetch";
import { apiUrl } from "./rpc";

export const desktopMeetingKeys = {
  all: (slug: string) => ["desktop-meetings", slug] as const,
  detail: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "detail", meetingId] as const,
  notes: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "notes", meetingId] as const,
  playback: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "playback", meetingId] as const,
  root: ["desktop-meetings"] as const,
  share: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "share", meetingId] as const,
};

export function fetchMeetings(slug: string): Promise<MeetingLibraryItem[]> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings`;
  return apiJson<{ records: MeetingLibraryItem[] }>(apiUrl(path), "加载会议记录失败").then(
    (payload) => payload.records,
  );
}

export function fetchMeetingDetail(slug: string, meetingId: string): Promise<MeetingDetail | null> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}`;
  return apiJson<MeetingDetail | null>(apiUrl(path), "加载会议详情失败", { allow404: true });
}

export function fetchMeetingPlayback(
  slug: string,
  meetingId: string,
): Promise<MeetingPlaybackAuthorization | null> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}/playback`;
  return apiJson<MeetingPlaybackAuthorization | null>(apiUrl(path), "获取会议播放地址失败", {
    allow404: true,
  });
}

export function retryMeetingPlayback(
  slug: string,
  meetingId: string,
): Promise<{ state: "processing" | "ready" }> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}/playback/retry`;
  return apiJson(apiUrl(path), "重试会议录音处理失败", { method: "POST" });
}

function meetingSubresourcePath(slug: string, meetingId: string, resource: string): string {
  return `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}/${resource}`;
}

export function fetchMeetingNotes(slug: string, meetingId: string): Promise<MeetingNote[]> {
  return apiJson<{ records: MeetingNote[] }>(
    apiUrl(meetingSubresourcePath(slug, meetingId, "notes")),
    "加载 Meeting Notes 失败",
  ).then((payload) => payload.records);
}

export function createMeetingNote(
  slug: string,
  meetingId: string,
  note: CreateMeetingNoteInput,
): Promise<MeetingNote> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "notes")),
    "创建 Meeting Note 失败",
    {
      body: JSON.stringify(note),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function updateMeetingNote(
  slug: string,
  meetingId: string,
  noteId: string,
  note: UpdateMeetingNoteInput,
): Promise<MeetingNote> {
  const path = `${meetingSubresourcePath(slug, meetingId, "notes")}/${encodeURIComponent(noteId)}`;
  return apiJson(apiUrl(path), "更新 Meeting Note 失败", {
    body: JSON.stringify(note),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

export function deleteMeetingNote(slug: string, meetingId: string, noteId: string): Promise<null> {
  const path = `${meetingSubresourcePath(slug, meetingId, "notes")}/${encodeURIComponent(noteId)}`;
  return apiJson(apiUrl(path), "删除 Meeting Note 失败", { method: "DELETE" });
}

export function fetchMeetingShare(slug: string, meetingId: string): Promise<MeetingShareSettings> {
  return apiJson(apiUrl(meetingSubresourcePath(slug, meetingId, "share")), "加载会议分享设置失败");
}

export function updateMeetingShare(
  slug: string,
  meetingId: string,
  share: UpdateMeetingShareInput,
): Promise<{ updated: true }> {
  return apiJson(apiUrl(meetingSubresourcePath(slug, meetingId, "share")), "更新会议分享失败", {
    body: JSON.stringify(share),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

export function reassignMeetingOwner(
  slug: string,
  meetingId: string,
  userId: string,
): Promise<{ updated: true }> {
  return apiJson(
    apiUrl(`${meetingSubresourcePath(slug, meetingId, "share")}/owner`),
    "重新分配会议失败",
    {
      body: JSON.stringify({ userId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}
