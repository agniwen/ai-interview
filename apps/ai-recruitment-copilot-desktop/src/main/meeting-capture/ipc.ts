// oxlint-disable promise/prefer-await-to-callbacks -- Electron permission and MessagePort APIs are callback/event based.
import { desktopCapturer, ipcMain, session } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent, MessagePortMain, WebContents } from "electron";
import type {
  FragmentWriteRequest,
  FragmentWriteResponse,
} from "../../preload/meeting-capture-api";
import type { LocalMeetingRecordingStore } from "./local-meeting-recording-store";
import { getMainWindowWebContents } from "../window";

const MAX_FRAGMENT_BYTES = 32 * 1024 * 1024;
const CAPTURE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTrustedApplicationContents(contents: WebContents | null): boolean {
  return Boolean(contents && getMainWindowWebContents() === contents);
}

function isTrustedMainDocument(
  contents: WebContents | null,
  details: { isMainFrame: boolean; requestingUrl?: string },
): boolean {
  const trustedContents = getMainWindowWebContents();
  return Boolean(
    contents &&
    trustedContents === contents &&
    details.isMainFrame &&
    details.requestingUrl === trustedContents.mainFrame.url,
  );
}

function isTrustedMainFrame(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isTrustedApplicationContents(event.sender) && event.senderFrame === event.sender.mainFrame;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCaptureId(value: unknown): value is string {
  return typeof value === "string" && CAPTURE_ID_PATTERN.test(value);
}

function isContentType(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isBeginRequest(
  input: unknown,
): input is Parameters<LocalMeetingRecordingStore["begin"]>[0] {
  if (!(input && typeof input === "object")) {
    return false;
  }
  const request = input as Record<string, unknown>;
  const trackContentTypes = request.trackContentTypes as Record<string, unknown> | undefined;
  return (
    isCaptureId(request.captureId) &&
    (request.recruitingRecordId === null || typeof request.recruitingRecordId === "string") &&
    typeof request.startedAt === "string" &&
    Boolean(trackContentTypes) &&
    isContentType(trackContentTypes?.microphone) &&
    isContentType(trackContentTypes?.system) &&
    Number.isInteger(request.videoTracksDiscarded) &&
    isFiniteNonNegative(request.videoTracksDiscarded)
  );
}

function isFragmentInput(input: unknown): input is FragmentWriteRequest["input"] {
  if (!(input && typeof input === "object")) {
    return false;
  }
  const fragment = input as Record<string, unknown>;
  return (
    isCaptureId(fragment.captureId) &&
    isContentType(fragment.contentType) &&
    (fragment.track === "microphone" || fragment.track === "system") &&
    Number.isInteger(fragment.sequence) &&
    isFiniteNonNegative(fragment.sequence) &&
    isFiniteNonNegative(fragment.durationMs) &&
    isFiniteNonNegative(fragment.startedAtMonotonicMs) &&
    isFiniteNonNegative(fragment.endedAtMonotonicMs)
  );
}

function isFragmentRequest(data: unknown): data is FragmentWriteRequest {
  if (!(data && typeof data === "object")) {
    return false;
  }
  const request = data as Partial<FragmentWriteRequest>;
  return (
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength <= MAX_FRAGMENT_BYTES &&
    typeof request.id === "string" &&
    request.id.length > 0 &&
    request.id.length <= 128 &&
    isFragmentInput(request.input)
  );
}

function respond(port: MessagePortMain, response: FragmentWriteResponse): void {
  port.postMessage(response);
}

export function registerMeetingCaptureIpc(store: LocalMeetingRecordingStore): void {
  ipcMain.handle("meeting-capture:begin", (event, input) => {
    if (!isTrustedMainFrame(event) || !isBeginRequest(input)) {
      throw new Error("不受信任的录制请求");
    }
    return store.begin(input);
  });
  ipcMain.handle("meeting-capture:save", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的录制请求");
    }
    return store.save(captureId);
  });
  ipcMain.handle("meeting-capture:discard", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的录制请求");
    }
    return store.discard(captureId);
  });
  ipcMain.handle("meeting-capture:recover", (event) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的录制请求");
    }
    return store.recover();
  });

  ipcMain.on("meeting-capture:fragment-port", (event) => {
    const [port] = event.ports;
    if (!(port && event.ports.length === 1 && isTrustedMainFrame(event))) {
      port?.close();
      return;
    }
    port.on("message", ({ data }: { data: unknown }) => {
      if (!isFragmentRequest(data)) {
        respond(port, {
          error: "音频分片无效或超过 32 MiB 安全上限",
          id:
            data && typeof data === "object" && "id" in data && typeof data.id === "string"
              ? data.id
              : "unknown",
          ok: false,
        });
        return;
      }
      void (async () => {
        try {
          await store.append(data.input, new Uint8Array(data.bytes));
          respond(port, { id: data.id, ok: true });
        } catch (error) {
          respond(port, {
            error: error instanceof Error ? error.message : "音频分片落盘失败",
            id: data.id,
            ok: false,
          });
        }
      })();
    });
    port.start();
  });
}

export function registerMeetingCaptureMediaSession(): void {
  const appSession = session.defaultSession;
  appSession.setPermissionCheckHandler(
    (contents, permission, _requestingOrigin, details) =>
      permission === "media" &&
      details.mediaType === "audio" &&
      isTrustedMainDocument(contents, details),
  );
  appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const isAudioOnly =
      "mediaTypes" in details &&
      details.mediaTypes?.length === 1 &&
      details.mediaTypes[0] === "audio";
    const allowedPermission =
      permission === "display-capture" || (permission === "media" && isAudioOnly);
    callback(allowedPermission && isTrustedMainDocument(contents, details));
  });
  appSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const trustedContents = getMainWindowWebContents();
      if (!trustedContents || request.frame !== trustedContents.mainFrame) {
        callback({});
        return;
      }
      try {
        const sources = await desktopCapturer.getSources({
          thumbnailSize: { height: 0, width: 0 },
          types: ["screen"],
        });
        const [source] = sources;
        if (!source) {
          callback({});
          return;
        }
        callback({
          audio: request.audioRequested ? "loopback" : undefined,
          video: request.videoRequested ? source : undefined,
        });
      } catch (error) {
        console.error("[meeting-capture] display-media grant failed", error);
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}
