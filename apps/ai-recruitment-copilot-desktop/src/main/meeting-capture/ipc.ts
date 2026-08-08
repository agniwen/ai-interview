// oxlint-disable promise/prefer-await-to-callbacks -- Electron permission and MessagePort APIs are callback/event based.
import { BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import type { MessagePortMain, WebContents } from "electron";
import type {
  FragmentWriteRequest,
  FragmentWriteResponse,
} from "../../preload/meeting-capture-api";
import type { LocalMeetingRecordingStore } from "./local-meeting-recording-store";

const MAX_FRAGMENT_BYTES = 32 * 1024 * 1024;

function isTrustedApplicationContents(contents: WebContents | null): boolean {
  return Boolean(
    contents && BrowserWindow.getAllWindows().some((window) => window.webContents === contents),
  );
}

function respond(port: MessagePortMain, response: FragmentWriteResponse): void {
  port.postMessage(response);
}

export function registerMeetingCaptureIpc(store: LocalMeetingRecordingStore): void {
  ipcMain.handle("meeting-capture:begin", (event, input) => {
    if (!isTrustedApplicationContents(event.sender)) {
      throw new Error("不受信任的录制请求");
    }
    return store.begin(input);
  });
  ipcMain.handle("meeting-capture:save", (event, captureId) => {
    if (!isTrustedApplicationContents(event.sender)) {
      throw new Error("不受信任的录制请求");
    }
    return store.save(captureId);
  });
  ipcMain.handle("meeting-capture:discard", (event, captureId) => {
    if (!isTrustedApplicationContents(event.sender)) {
      throw new Error("不受信任的录制请求");
    }
    return store.discard(captureId);
  });
  ipcMain.handle("meeting-capture:recover", (event) => {
    if (!isTrustedApplicationContents(event.sender)) {
      throw new Error("不受信任的录制请求");
    }
    return store.recover();
  });

  ipcMain.on("meeting-capture:fragment-port", (event) => {
    const [port] = event.ports;
    if (!(port && isTrustedApplicationContents(event.sender))) {
      port?.close();
      return;
    }
    port.on("message", ({ data }: { data: FragmentWriteRequest }) => {
      if (!(data?.bytes instanceof ArrayBuffer) || data.bytes.byteLength > MAX_FRAGMENT_BYTES) {
        respond(port, {
          error: "音频分片无效或超过 32 MiB 安全上限",
          id: data?.id ?? "unknown",
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
    (contents, permission) => permission === "media" && isTrustedApplicationContents(contents),
  );
  appSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(permission === "media" && isTrustedApplicationContents(contents));
  });
  appSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
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
