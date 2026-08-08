import type {
  MeetingDetail,
  MeetingLibraryItem,
  MeetingPlaybackAuthorization,
} from "@arc/shared/meeting-recording";
import { apiJson } from "./rpc-fetch";
import { apiUrl } from "./rpc";

export const desktopMeetingKeys = {
  all: (slug: string) => ["desktop-meetings", slug] as const,
  detail: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "detail", meetingId] as const,
  playback: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "playback", meetingId] as const,
  root: ["desktop-meetings"] as const,
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
