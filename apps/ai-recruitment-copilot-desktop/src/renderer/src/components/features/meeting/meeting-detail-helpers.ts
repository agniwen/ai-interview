import type {
  MeetingDetail,
  MeetingPlaybackAuthorization,
  MeetingProcessingState,
} from "@arc/shared/meeting-recording";
import type { MeetingTranscriptResult } from "@arc/shared/meeting-transcription";
import type { LiveTranscriptDraftStatus } from "@/lib/meeting-capture/live-transcript-draft";
import type { LocalMeetingSessionState } from "../../../../../preload/local-meeting-session";
import type { WorkspaceSavePhase } from "../../../../../preload/meeting-capture";

const LOCAL_WORKSPACE_SAVE_LABEL: Record<WorkspaceSavePhase, string> = {
  "action-required": "上传需要处理",
  uploading: "正在上传",
  verifying: "正在验证",
  "waiting-for-network": "等待网络后自动上传",
  "workspace-verified": "已保存到工作区",
};

export function localWorkspaceSaveLabel(state: WorkspaceSavePhase): string {
  return LOCAL_WORKSPACE_SAVE_LABEL[state];
}

const UNFINISHED_LOCAL_SESSION_STATES = new Set<LocalMeetingSessionState>([
  "interrupted",
  "paused",
  "recording",
]);

/** Live-draft badge status for a stored local session. Saved uploads are idle, not interrupted. */
export function localStoredDraftStatus(
  sessionState: LocalMeetingSessionState | undefined,
): LiveTranscriptDraftStatus {
  if (sessionState && UNFINISHED_LOCAL_SESSION_STATES.has(sessionState)) {
    return "interrupted";
  }
  return "idle";
}

export function canRetryMeetingProcessing(role: MeetingDetail["accessRole"]): boolean {
  return role === "administrator" || role === "owner";
}

export type MeetingPostSaveStepId = "playback" | "transcript" | "upload";

export interface MeetingPostSaveStep {
  failed: boolean;
  id: MeetingPostSaveStepId;
  label: string;
  retryLabel?: string;
}

export function sessionDetailStatus(input: {
  playbackState?: MeetingProcessingState;
  transcript?: Pick<MeetingTranscriptResult, "error" | "state">;
  uploadFailed?: boolean;
  uploadLabel?: string;
}): MeetingPostSaveStep | null {
  if (input.uploadFailed && input.uploadLabel) {
    return {
      failed: true,
      id: "upload",
      label: input.uploadLabel,
      retryLabel: "重试上传",
    };
  }
  if (input.playbackState === "failed") {
    return {
      failed: true,
      id: "playback",
      label: "可播放录音生成失败，原始双轨录音仍保留",
      retryLabel: "重试生成播放音频",
    };
  }
  if (input.transcript?.state === "failed") {
    return {
      failed: true,
      id: "transcript",
      label: input.transcript.error?.trim() || "最终字幕生成失败",
      retryLabel: "重试生成最终字幕",
    };
  }
  if (input.uploadLabel) {
    return {
      failed: false,
      id: "upload",
      label: input.uploadLabel,
    };
  }
  if (input.playbackState === "processing") {
    return {
      failed: false,
      id: "playback",
      label: "正在生成可播放录音",
    };
  }
  if (input.transcript?.state === "pending" || input.transcript?.state === "processing") {
    return {
      failed: false,
      id: "transcript",
      label: "正在生成最终字幕",
    };
  }
  return null;
}

export function meetingDetailRefetchInterval(
  meeting: MeetingDetail | null | undefined,
): number | false {
  if (meeting?.processingState === "processing") {
    return 5000;
  }
  if (meeting?.processingState === "failed") {
    return 30_000;
  }
  return false;
}

export function playbackAuthorizationRefetchInterval(
  playback: MeetingPlaybackAuthorization | null | undefined,
  now = Date.now(),
): number | false {
  if (!playback) {
    return false;
  }
  const expiresAt = Date.parse(playback.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return 60_000;
  }
  return Math.max(1000, expiresAt - now - 60_000);
}
