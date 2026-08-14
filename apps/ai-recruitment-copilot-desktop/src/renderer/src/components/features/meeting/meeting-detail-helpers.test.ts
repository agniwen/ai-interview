import { describe, expect, it } from "vitest";
import {
  localStoredDraftStatus,
  localWorkspaceSaveLabel,
  sessionDetailStatus,
} from "./meeting-detail-helpers";

describe("localStoredDraftStatus", () => {
  it("keeps interrupted only for recordings that did not finish saving", () => {
    expect(localStoredDraftStatus("interrupted")).toBe("interrupted");
    expect(localStoredDraftStatus("paused")).toBe("interrupted");
    expect(localStoredDraftStatus("recording")).toBe("interrupted");
  });

  it("does not mark a saved or uploading session as interrupted", () => {
    expect(localStoredDraftStatus("saved-local")).toBe("idle");
    expect(localStoredDraftStatus("uploading")).toBe("idle");
    expect(localStoredDraftStatus("workspace-verified")).toBe("idle");
    expect(localStoredDraftStatus("sync-failed")).toBe("idle");
    expect(localStoredDraftStatus("finalizing-local")).toBe("idle");
  });

  it("uses Chinese labels for local workspace upload states", () => {
    expect(localWorkspaceSaveLabel("uploading")).toBe("正在上传");
    expect(localWorkspaceSaveLabel("waiting-for-network")).toBe("等待网络后自动上传");
    expect(localWorkspaceSaveLabel("action-required")).toBe("上传需要处理");
    expect(localWorkspaceSaveLabel("verifying")).toBe("正在验证");
  });
});

describe("sessionDetailStatus", () => {
  it("names a playback mix failure separately from final transcription", () => {
    expect(sessionDetailStatus({ playbackState: "failed" })).toEqual({
      failed: true,
      id: "playback",
      label: "可播放录音生成失败，原始双轨录音仍保留",
      retryLabel: "重试生成播放音频",
    });
  });

  it("names a final-transcript failure without blaming playback", () => {
    expect(
      sessionDetailStatus({
        playbackState: "ready",
        transcript: {
          error: "最终会议转录因 provider 配额不足失败，录音已保留，请稍后重试。",
          state: "failed",
        },
      }),
    ).toEqual({
      failed: true,
      id: "transcript",
      label: "最终会议转录因 provider 配额不足失败，录音已保留，请稍后重试。",
      retryLabel: "重试生成最终字幕",
    });
  });

  it("shows a single in-flight line and prefers playback while it is still mixing", () => {
    expect(
      sessionDetailStatus({
        playbackState: "processing",
        transcript: { error: null, state: "pending" },
      }),
    ).toEqual({
      failed: false,
      id: "playback",
      label: "正在生成可播放录音",
    });
  });

  it("switches to the transcript line after playback is ready", () => {
    expect(
      sessionDetailStatus({
        playbackState: "ready",
        transcript: { error: null, state: "processing" },
      }),
    ).toEqual({
      failed: false,
      id: "transcript",
      label: "正在生成最终字幕",
    });
  });

  it("prefers an in-flight upload over later processing copy", () => {
    expect(
      sessionDetailStatus({
        playbackState: "processing",
        uploadLabel: "正在上传",
      }),
    ).toEqual({
      failed: false,
      id: "upload",
      label: "正在上传",
    });
  });
});
