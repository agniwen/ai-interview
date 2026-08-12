// oxlint-disable class-methods-use-this, prefer-await-to-callbacks, promise/avoid-new -- The stateless adapter implements the store interface and races the invoke ack against a bounded write timeout.
import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
  LocalSavedMeeting,
  MeetingRecordingStore,
  RecoverableMeetingCapture,
} from "../../../../preload/meeting-capture";
import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";

const WRITE_TIMEOUT_MS = 30_000;

/**
 * 分片落盘走 ipcRenderer.invoke（与 begin/save 同一条桥接通道），而不是跨
 * window.postMessage → preload 转发 MessagePort 的握手链路——后者曾导致分片
 * 静默丢失、保存永远超时。
 * Fragments persist through ipcRenderer.invoke (the same bridge as begin/save);
 * the window.postMessage MessagePort handshake previously dropped fragments silently.
 */
export class DesktopMeetingRecordingStore implements MeetingRecordingStore {
  begin(input: BeginLocalCaptureInput): Promise<void> {
    return window.api.meetingCapture.begin(input);
  }

  append(input: AppendLocalFragmentInput, bytes: Uint8Array): Promise<void> {
    const startedAt = Date.now();
    console.info("[meeting-capture-renderer] fragment sending", {
      bytes: bytes.byteLength,
      captureId: input.captureId,
      sequence: input.sequence,
      track: input.track,
    });
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        console.error("[meeting-capture-renderer] fragment write timed out", {
          elapsedMs: Date.now() - startedAt,
          sequence: input.sequence,
          timeoutMs: WRITE_TIMEOUT_MS,
          track: input.track,
        });
        reject(new Error("本地录音分片落盘超时"));
      }, WRITE_TIMEOUT_MS);
    });
    return Promise.race([
      (async () => {
        try {
          await window.api.meetingCapture.appendFragment(input, bytes);
          console.info("[meeting-capture-renderer] fragment ack", {
            elapsedMs: Date.now() - startedAt,
            ok: true,
            sequence: input.sequence,
            track: input.track,
          });
        } catch (error) {
          console.info("[meeting-capture-renderer] fragment ack", {
            elapsedMs: Date.now() - startedAt,
            errorMessage: error instanceof Error ? error.message : String(error),
            ok: false,
            sequence: input.sequence,
            track: input.track,
          });
          throw error instanceof Error ? error : new Error("音频分片落盘失败");
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
      })(),
      timedOut,
    ]);
  }

  save(
    captureId: string,
    liveTranscriptDraft?: MeetingLiveTranscriptDraft | null,
  ): Promise<LocalSavedMeeting> {
    return window.api.meetingCapture.save(captureId, liveTranscriptDraft);
  }

  discard(captureId: string): Promise<void> {
    return window.api.meetingCapture.discard(captureId);
  }

  markWorkspaceVerified(captureId: string, recoveryCopyDeleteAfter: string): Promise<void> {
    return window.api.meetingCapture.markWorkspaceVerified(captureId, recoveryCopyDeleteAfter);
  }

  recover(): Promise<RecoverableMeetingCapture[]> {
    return window.api.meetingCapture.recover();
  }
}
