import type {
  MeetingIntelligenceResult,
  MeetingIntelligenceTemplate,
} from "@arc/shared/meeting-intelligence";
import type {
  CreateMeetingQuestion,
  MeetingQuestionExchange,
  MeetingQuestionThread,
  MeetingQuestionThreadSummary,
} from "@arc/shared/meeting-answer";
import type {
  CreateMeetingNoteInput,
  MeetingDetail,
  MeetingLibraryItem,
  MeetingNote,
  MeetingPlaybackAuthorization,
  MeetingRecruitingContextSettings,
  MeetingRecruitingRecordSummary,
  MeetingShareSettings,
  TrashedMeetingItem,
  UpdateMeetingNoteInput,
  UpdateMeetingShareInput,
} from "@arc/shared/meeting-recording";
import type {
  CreateMeetingLiveTranscriptAuthorizationInput,
  CreateMeetingTranscriptCorrectionInput,
  FinalMeetingTranscriptRevision,
  MeetingLiveTranscriptAuthorization,
  MeetingTranscriptResult,
  MeetingTranscriptRevisionHistory,
  MeetingTranscriptionPolicy,
  UpdateMeetingTranscriptionPolicyInput,
} from "@arc/shared/meeting-transcription";
import type {
  MeetingLibrarySearchResponse,
  MeetingLibrarySearchResult,
} from "@arc/shared/meeting-search";
import type { MeetingAudioExportTrack, MeetingExportFormat } from "@arc/shared/meeting-export";
import { apiJson } from "./rpc-fetch";
import { apiUrl } from "./rpc";
import { isApiError } from "./api-error";

/**
 * Meeting Query key 工厂。层级前缀用于在 Note、修订、生命周期等写操作后精确或整组失效。
 * Meeting query-key factory whose hierarchy supports precise or subtree invalidation after mutations.
 */
export const desktopMeetingKeys = {
  all: (slug: string) => ["desktop-meetings", slug] as const,
  detail: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "detail", meetingId] as const,
  intelligence: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "intelligence", meetingId] as const,
  notes: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "notes", meetingId] as const,
  playback: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "playback", meetingId] as const,
  questionThread: (slug: string, meetingId: string, threadId: string) =>
    ["desktop-meetings", slug, "questions", meetingId, threadId] as const,
  questions: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "questions", meetingId] as const,
  recruitingContext: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "recruiting-context", meetingId] as const,
  recruitingContextCandidates: (slug: string, meetingId: string, search: string) =>
    ["desktop-meetings", slug, "recruiting-context", meetingId, "candidates", search] as const,
  root: ["desktop-meetings"] as const,
  search: (slug: string, query: string, timeZone: string) =>
    ["desktop-meetings", slug, "search", query, timeZone] as const,
  searchRoot: (slug: string) => ["desktop-meetings", slug, "search"] as const,
  share: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "share", meetingId] as const,
  transcript: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "transcript", meetingId] as const,
  transcriptHistory: (slug: string, meetingId: string) =>
    ["desktop-meetings", slug, "transcript", meetingId, "revisions"] as const,
  transcriptRevision: (slug: string, meetingId: string, revisionId: string) =>
    ["desktop-meetings", slug, "transcript", meetingId, "revisions", revisionId] as const,
  transcriptionPolicy: (slug: string) =>
    ["desktop-meetings", slug, "transcription-policy"] as const,
  trash: (slug: string) => ["desktop-meetings", slug, "trash"] as const,
};

function meetingSubresourcePath(slug: string, meetingId: string, resource: string): string {
  return `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}/${resource}`;
}

export function meetingExportUrl(
  slug: string,
  meetingId: string,
  format: MeetingExportFormat,
  track?: MeetingAudioExportTrack,
): string {
  // 导出是二进制/流式响应，不能走 JSON RPC；这里只构造供 Main download session 使用的受限 URL。
  // Exports are binary/streaming rather than JSON RPC; build only the constrained URL consumed by main download session.
  const url = apiUrl(
    `${meetingSubresourcePath(slug, meetingId, "exports")}/${encodeURIComponent(format)}`,
  );
  if (format === "audio" && track) {
    return `${url}?${new URLSearchParams({ track }).toString()}`;
  }
  return url;
}

export function fetchMeetings(slug: string): Promise<MeetingLibraryItem[]> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings`;
  return apiJson<{ records: MeetingLibraryItem[] }>(apiUrl(path), "加载录制记录失败").then(
    (payload) => payload.records,
  );
}

export async function requestRecordingTitle(slug: string, transcript: string): Promise<string> {
  const text = transcript.slice(0, 6000);
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/title`;
  try {
    const result = await apiJson<{ title: string }>(apiUrl(path), "生成录制标题失败", {
      body: JSON.stringify({ transcript: text }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return result.title;
  } catch (error) {
    if (!(isApiError(error) && error.status === 404)) {
      throw error;
    }
  }

  // Compatibility for desktops pointed at a server release that predates the
  // meeting-specific title route. This is still AI summarization, not a local
  // substring fallback, and can be removed after that route is fully deployed.
  const fallback = await apiJson<{ title: string }>(
    apiUrl("/api/resume/title"),
    "生成录制标题失败",
    {
      body: JSON.stringify({ hasFiles: false, text }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (fallback.title === "新对话") {
    throw new Error("生成录制标题失败");
  }
  return fallback.title;
}

export function fetchTrashedMeetings(slug: string): Promise<TrashedMeetingItem[]> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/trash`;
  return apiJson<{ records: TrashedMeetingItem[] }>(apiUrl(path), "加载录制废纸篓失败").then(
    (payload) => payload.records,
  );
}

export function trashMeeting(
  slug: string,
  meetingId: string,
): Promise<{ purgeAfter: string; state: "already-trashed" | "trashed" }> {
  return apiJson(apiUrl(meetingSubresourcePath(slug, meetingId, "trash")), "移入废纸篓失败", {
    method: "POST",
  });
}

export function restoreMeeting(slug: string, meetingId: string): Promise<{ state: "restored" }> {
  return apiJson(apiUrl(meetingSubresourcePath(slug, meetingId, "restore")), "恢复会议失败", {
    method: "POST",
  });
}

export function renameMeeting(
  slug: string,
  meetingId: string,
  title: string,
): Promise<{ title: string }> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}`;
  return apiJson(apiUrl(path), "修改录制名称失败", {
    body: JSON.stringify({ title }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

export async function purgeMeeting(slug: string, meetingId: string): Promise<null> {
  // localRecoveryCleanup 只描述当前设备的清理结果；服务端仍会协调其他设备和持久化对象的清扫。
  // localRecoveryCleanup reports this device only; server purge still coordinates other devices and durable objects.
  let localRecoveryCleanup = "deleted";
  try {
    await window.api.meetingCapture.discard(meetingId);
  } catch {
    localRecoveryCleanup = "failed";
  }
  const query = new URLSearchParams({ localRecoveryCleanup });
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/${encodeURIComponent(meetingId)}?${query.toString()}`;
  return apiJson<null>(apiUrl(path), "永久清除会议失败", { method: "DELETE" });
}

export function searchMeetings(
  slug: string,
  query: string,
  timeZone: string,
  signal?: AbortSignal,
): Promise<MeetingLibrarySearchResult[]> {
  // timeZone 属于查询语义和缓存身份，AbortSignal 则淘汰 debounce 后仍过期的在途请求。
  // timeZone is part of query semantics/cache identity, while AbortSignal cancels superseded in-flight searches.
  const params = new URLSearchParams({ limit: "20", q: query, timeZone });
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/search?${params.toString()}`;
  return apiJson<MeetingLibrarySearchResponse>(apiUrl(path), "搜索录制记录失败", { signal }).then(
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

export function fetchMeetingRecruitingContext(
  slug: string,
  meetingId: string,
): Promise<MeetingRecruitingContextSettings | null> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "recruiting-context")),
    "加载招聘关联失败",
    { allow404: true },
  );
}

export function fetchMeetingRecruitingContextCandidates(
  slug: string,
  meetingId: string,
  search: string,
  signal?: AbortSignal,
): Promise<MeetingRecruitingRecordSummary[]> {
  const params = new URLSearchParams({ limit: "20" });
  if (search.trim()) {
    params.set("search", search.trim());
  }
  return apiJson<{ records: MeetingRecruitingRecordSummary[] }>(
    apiUrl(
      `${meetingSubresourcePath(slug, meetingId, "recruiting-context")}/candidates?${params.toString()}`,
    ),
    "加载招聘记录候选项失败",
    { signal },
  ).then((payload) => payload.records);
}

export function updateMeetingRecruitingContext(
  slug: string,
  meetingId: string,
  recruitingRecordId: string | null,
): Promise<{ state: "unchanged" | "updated" }> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "recruiting-context")),
    "保存招聘关联失败",
    {
      body: JSON.stringify({ recruitingRecordId }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    },
  );
}

export function fetchMeetingTranscript(
  slug: string,
  meetingId: string,
): Promise<MeetingTranscriptResult> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "transcript")),
    "加载最终会议转录失败",
  );
}

export function fetchMeetingIntelligence(
  slug: string,
  meetingId: string,
): Promise<MeetingIntelligenceResult> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "intelligence")),
    "加载 Meeting Intelligence 失败",
  );
}

export function fetchMeetingQuestionThreads(
  slug: string,
  meetingId: string,
): Promise<MeetingQuestionThreadSummary[]> {
  return apiJson<{ records: MeetingQuestionThreadSummary[] }>(
    apiUrl(meetingSubresourcePath(slug, meetingId, "questions")),
    "加载会议提问线程失败",
  ).then((payload) => payload.records);
}

export function createMeetingQuestionThread(
  slug: string,
  meetingId: string,
  title?: string,
): Promise<MeetingQuestionThreadSummary> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "questions")),
    "创建会议提问线程失败",
    {
      body: JSON.stringify(title ? { title } : {}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function fetchMeetingQuestionThread(
  slug: string,
  meetingId: string,
  threadId: string,
): Promise<MeetingQuestionThread> {
  return apiJson(
    apiUrl(
      `${meetingSubresourcePath(slug, meetingId, "questions")}/${encodeURIComponent(threadId)}`,
    ),
    "加载会议提问内容失败",
  );
}

export function askMeetingQuestion(
  slug: string,
  meetingId: string,
  threadId: string,
  input: CreateMeetingQuestion,
): Promise<MeetingQuestionExchange> {
  return apiJson(
    apiUrl(
      `${meetingSubresourcePath(slug, meetingId, "questions")}/${encodeURIComponent(threadId)}/messages`,
    ),
    "提交会议问题失败",
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function regenerateMeetingIntelligence(
  slug: string,
  meetingId: string,
  template: MeetingIntelligenceTemplate,
): Promise<{ state: "processing" }> {
  return apiJson(
    apiUrl(meetingSubresourcePath(slug, meetingId, "intelligence")),
    "重新生成 Meeting Intelligence 失败",
    {
      body: JSON.stringify({ template }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function retryMeetingTranscript(
  slug: string,
  meetingId: string,
): Promise<{ state: "processing" | "ready" }> {
  return apiJson(
    apiUrl(`${meetingSubresourcePath(slug, meetingId, "transcript")}/retry`),
    "重试最终会议转录失败",
    { method: "POST" },
  );
}

export function fetchMeetingTranscriptHistory(
  slug: string,
  meetingId: string,
): Promise<MeetingTranscriptRevisionHistory> {
  return apiJson(
    apiUrl(`${meetingSubresourcePath(slug, meetingId, "transcript")}/revisions`),
    "加载会议转录修订历史失败",
  );
}

export function fetchMeetingTranscriptRevision(
  slug: string,
  meetingId: string,
  revisionId: string,
): Promise<FinalMeetingTranscriptRevision> {
  return apiJson(
    apiUrl(
      `${meetingSubresourcePath(slug, meetingId, "transcript")}/revisions/${encodeURIComponent(revisionId)}`,
    ),
    "加载会议转录 revision 失败",
  );
}

export function createMeetingTranscriptCorrection(
  slug: string,
  meetingId: string,
  correction: CreateMeetingTranscriptCorrectionInput,
): Promise<FinalMeetingTranscriptRevision> {
  return apiJson(
    apiUrl(`${meetingSubresourcePath(slug, meetingId, "transcript")}/corrections`),
    "保存会议转录修订失败",
    {
      body: JSON.stringify(correction),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function fetchMeetingTranscriptionPolicy(slug: string): Promise<MeetingTranscriptionPolicy> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/transcription-policy`;
  return apiJson(apiUrl(path), "加载最终转录策略失败");
}

export function createMeetingLiveTranscriptAuthorization(
  slug: string,
  input: CreateMeetingLiveTranscriptAuthorizationInput,
): Promise<MeetingLiveTranscriptAuthorization> {
  // 这里只获取短期、单轨授权；长期 Provider key 永不进入 Desktop。
  // This returns a short-lived track-scoped grant; long-lived provider credentials never enter Desktop.
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/live-transcript`;
  return apiJson(apiUrl(path), "创建实时字幕授权失败", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
}

export function heartbeatMeetingLiveTranscript(slug: string, captureId: string): Promise<null> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/live-transcript/${encodeURIComponent(captureId)}/heartbeat`;
  return apiJson<null>(apiUrl(path), "续期实时字幕失败", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
}

export function releaseMeetingLiveTranscript(slug: string, captureId: string): Promise<null> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/live-transcript/${encodeURIComponent(captureId)}`;
  return apiJson<null>(apiUrl(path), "释放实时字幕失败", {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
}

export function updateMeetingTranscriptionPolicy(
  slug: string,
  policy: UpdateMeetingTranscriptionPolicyInput,
): Promise<MeetingTranscriptionPolicy> {
  const path = `/api/w/${encodeURIComponent(slug)}/meetings/transcription-policy`;
  return apiJson(apiUrl(path), "更新最终转录策略失败", {
    body: JSON.stringify(policy),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
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
