import { ipcMain } from "electron";
import { z } from "zod";
import type { IpcMainInvokeEvent } from "electron";

const MAX_PLAYBACK_BYTES = 512 * 1024 * 1024;
const PLAYBACK_FETCH_TIMEOUT_MS = 60_000;
const playbackUrlSchema = z.string().max(8192);
type PlaybackUrlInput = z.input<typeof playbackUrlSchema>;

export function isAllowedRecordingPlaybackUrl(value: string, recordingOrigin: string): boolean {
  try {
    const url = new URL(value);
    const allowed = new URL(recordingOrigin);
    return (
      allowed.protocol === "https:" &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname === allowed.hostname || url.hostname.endsWith(`.${allowed.hostname}`))
    );
  } catch {
    return false;
  }
}

export async function readRecordingPlaybackBytes(
  url: string,
  recordingOrigin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  if (!isAllowedRecordingPlaybackUrl(url, recordingOrigin)) {
    throw new Error("录音播放地址不属于已配置的 Recording R2");
  }
  const response = await fetchImpl(url, {
    redirect: "error",
    signal: AbortSignal.timeout(PLAYBACK_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`读取录音波形失败（${response.status}）`);
  }
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_PLAYBACK_BYTES) {
    throw new Error("录音文件过大，无法生成波形");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_PLAYBACK_BYTES) {
    throw new Error("录音文件过大，无法生成波形");
  }
  return bytes;
}

export function registerMeetingPlaybackIpc(
  recordingOrigin: string | undefined,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  ipcMainLike: Pick<typeof ipcMain, "handle"> = ipcMain,
): void {
  ipcMainLike.handle("meeting-playback:read-audio-bytes", (event, input: PlaybackUrlInput) => {
    if (!recordingOrigin) {
      throw new Error("Recording R2 地址未配置");
    }
    const parsed = playbackUrlSchema.safeParse(input);
    if (!isTrusted(event) || !parsed.success) {
      throw new Error("不受信任的录音波形请求");
    }
    return readRecordingPlaybackBytes(parsed.data, recordingOrigin);
  });
}
