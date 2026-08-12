// oxlint-disable promise/prefer-await-to-callbacks -- Electron permission APIs are callback based.
import { desktopCapturer, ipcMain, session } from "electron";
import { z } from "zod";
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type { AppendLocalFragmentInput } from "../../preload/meeting-capture";
import type { LocalMeetingRecordingStore } from "./local-meeting-recording-store";
import type {
  MultipartMeetingUploadInstruction,
  SmallMeetingUploadInstruction,
} from "@arc/shared/meeting-recording";
import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import { meetingLiveTranscriptDraftSchema } from "@arc/shared/meeting-transcription";
import { getMainWindowWebContents } from "../window";

const MAX_FRAGMENT_BYTES = 32 * 1024 * 1024;
const CAPTURE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localMeetingSessionPatchSchema = z
  .object({
    endedAt: z.string().datetime({ offset: true }).nullable().optional(),
    liveTranscriptDraft: meetingLiveTranscriptDraftSchema.nullable().optional(),
    segmentCount: z.number().int().positive().optional(),
    state: z
      .enum([
        "recording",
        "paused",
        "interrupted",
        "finalizing-local",
        "saved-local",
        "uploading",
        "workspace-verified",
        "sync-failed",
      ])
      .optional(),
    title: z.string().trim().min(1).max(RECORDING_TITLE_MAX_LENGTH).optional(),
  })
  .strict();

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

export function isTrustedMainFrame(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
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

function hasValidUploadHeaders(value: unknown): value is Record<string, string> {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const headers = value as Record<string, unknown>;
  return (
    isContentType(headers["content-type"]) &&
    typeof headers["x-amz-meta-sha256"] === "string" &&
    /^[a-f\d]{64}$/i.test(headers["x-amz-meta-sha256"]) &&
    typeof headers["x-amz-checksum-sha256"] === "string" &&
    /^[A-Za-z\d+/]{43}=$/.test(headers["x-amz-checksum-sha256"])
  );
}

function isUploadInstruction(value: unknown): value is SmallMeetingUploadInstruction {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const instruction = value as Record<string, unknown>;
  return (
    (instruction.track === "microphone" || instruction.track === "system") &&
    instruction.method === "PUT" &&
    isContentType(instruction.contentType) &&
    Number.isInteger(instruction.sizeBytes) &&
    isFiniteNonNegative(instruction.sizeBytes) &&
    typeof instruction.url === "string" &&
    instruction.url.length <= 8192 &&
    typeof instruction.expiresAt === "string" &&
    !Number.isNaN(Date.parse(instruction.expiresAt)) &&
    hasValidUploadHeaders(instruction.headers)
  );
}

function isMultipartPartIdentity(instruction: Record<string, unknown>): boolean {
  return (
    Number.isInteger(instruction.partNumber) &&
    typeof instruction.partNumber === "number" &&
    instruction.partNumber > 0 &&
    instruction.partNumber <= 10_000 &&
    Number.isInteger(instruction.offsetBytes) &&
    isFiniteNonNegative(instruction.offsetBytes) &&
    Number.isInteger(instruction.sizeBytes) &&
    typeof instruction.sizeBytes === "number" &&
    instruction.sizeBytes > 0
  );
}

function isMultipartUploadInstruction(value: unknown): value is MultipartMeetingUploadInstruction {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const instruction = value as Record<string, unknown>;
  const headers = instruction.headers as Record<string, unknown> | undefined;
  return (
    (instruction.track === "microphone" || instruction.track === "system") &&
    instruction.method === "PUT" &&
    isMultipartPartIdentity(instruction) &&
    typeof instruction.url === "string" &&
    instruction.url.length <= 8192 &&
    typeof instruction.expiresAt === "string" &&
    !Number.isNaN(Date.parse(instruction.expiresAt)) &&
    Boolean(headers) &&
    typeof headers?.["content-md5"] === "string" &&
    /^[A-Za-z\d+/]{22}==$/.test(headers["content-md5"])
  );
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

function isFragmentInput(input: unknown): input is AppendLocalFragmentInput {
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

function isFragmentBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= MAX_FRAGMENT_BYTES
  );
}

async function logCaptureOperation(
  operation: string,
  run: () => Promise<unknown>,
): Promise<unknown> {
  const startedAt = Date.now();
  try {
    const result = await run();
    console.info("[meeting-capture] operation ok", {
      elapsedMs: Date.now() - startedAt,
      operation,
    });
    return result;
  } catch (error: unknown) {
    console.error("[meeting-capture] operation failed", {
      elapsedMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : "UnknownError",
      operation,
    });
    throw error;
  }
}

/**
 * 录音 IPC 的安全边界：只接受主窗口主 Frame，并在任何磁盘或网络操作前验证载荷和大小上限。
 * Security boundary for capture IPC: only the trusted main frame may cross into disk/network operations after validation.
 */
export function registerMeetingCaptureIpc(store: LocalMeetingRecordingStore): void {
  ipcMain.handle("meeting-capture:list-local-sessions", (event) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的录制请求");
    }
    return store.listLocalSessions();
  });
  ipcMain.handle("meeting-capture:update-local-session", (event, captureId, patch) => {
    const parsed = localMeetingSessionPatchSchema.safeParse(patch);
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId) || !parsed.success) {
      throw new Error("不受信任的本地 Meeting Session 更新请求");
    }
    return store.updateLocalSession(captureId, parsed.data);
  });
  ipcMain.handle("meeting-capture:acknowledge-remote-visibility", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的本地 Meeting Session 确认请求");
    }
    return store.acknowledgeRemoteVisibility(captureId);
  });
  ipcMain.handle("meeting-capture:begin", (event, input) => {
    if (!isTrustedMainFrame(event) || !isBeginRequest(input)) {
      throw new Error("不受信任的录制请求");
    }
    console.info("[meeting-capture] begin", { captureId: input.captureId });
    return logCaptureOperation("begin", () => store.begin(input));
  });
  ipcMain.handle("meeting-capture:save", (event, captureId, liveTranscriptDraft) => {
    if (
      !isTrustedMainFrame(event) ||
      !isCaptureId(captureId) ||
      (liveTranscriptDraft !== undefined &&
        liveTranscriptDraft !== null &&
        !meetingLiveTranscriptDraftSchema.safeParse(liveTranscriptDraft).success)
    ) {
      throw new Error("不受信任的录制请求");
    }
    console.info("[meeting-capture] save", { captureId });
    return logCaptureOperation("save", () => store.save(captureId, liveTranscriptDraft));
  });
  ipcMain.handle("meeting-capture:describe-workspace-save", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的录制请求");
    }
    return store.describeWorkspaceSave(captureId);
  });
  ipcMain.handle("meeting-capture:describe-multipart-workspace-save", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的录制请求");
    }
    return store.describeMultipartWorkspaceSave(captureId);
  });
  ipcMain.handle("meeting-capture:upload-small", (event, captureId, instructions) => {
    if (
      !isTrustedMainFrame(event) ||
      !isCaptureId(captureId) ||
      !Array.isArray(instructions) ||
      instructions.length !== 2 ||
      !instructions.every(isUploadInstruction)
    ) {
      throw new Error("不受信任的录制上传请求");
    }
    return store.uploadSmall(captureId, instructions);
  });
  ipcMain.handle("meeting-capture:upload-multipart", (event, captureId, instructions) => {
    if (
      !isTrustedMainFrame(event) ||
      !isCaptureId(captureId) ||
      !Array.isArray(instructions) ||
      instructions.length > 20_000 ||
      !instructions.every(isMultipartUploadInstruction)
    ) {
      throw new Error("不受信任的录制 multipart 上传请求");
    }
    return store.uploadMultipart(captureId, instructions);
  });
  ipcMain.handle("meeting-capture:discard", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的录制请求");
    }
    return logCaptureOperation("discard", () => store.discard(captureId));
  });
  ipcMain.handle(
    "meeting-capture:mark-workspace-verified",
    (event, captureId, recoveryCopyDeleteAfter) => {
      if (
        !isTrustedMainFrame(event) ||
        !isCaptureId(captureId) ||
        typeof recoveryCopyDeleteAfter !== "string" ||
        Number.isNaN(Date.parse(recoveryCopyDeleteAfter))
      ) {
        throw new Error("不受信任的录制验证请求");
      }
      return store.markWorkspaceVerified(captureId, recoveryCopyDeleteAfter);
    },
  );
  ipcMain.handle("meeting-capture:recover", (event) => {
    if (!isTrustedMainFrame(event)) {
      throw new Error("不受信任的录制请求");
    }
    return store.recover();
  });
  ipcMain.handle("meeting-capture:resume-interrupted", (event, captureId, trackContentTypes) => {
    if (
      !isTrustedMainFrame(event) ||
      !isCaptureId(captureId) ||
      !(trackContentTypes && typeof trackContentTypes === "object") ||
      !isContentType(trackContentTypes.microphone) ||
      !isContentType(trackContentTypes.system)
    ) {
      throw new Error("不受信任的继续录制请求");
    }
    return logCaptureOperation("resume-interrupted", () =>
      store.resumeInterrupted(captureId, trackContentTypes),
    );
  });
  ipcMain.handle("meeting-capture:rollback-interrupted-resume", (event, captureId) => {
    if (!isTrustedMainFrame(event) || !isCaptureId(captureId)) {
      throw new Error("不受信任的继续录制回滚请求");
    }
    return logCaptureOperation("rollback-interrupted-resume", () =>
      store.rollbackInterruptedResume(captureId),
    );
  });

  ipcMain.handle("meeting-capture:append-fragment", async (event, input, bytes) => {
    if (!isTrustedMainFrame(event) || !isFragmentInput(input) || !isFragmentBytes(bytes)) {
      throw new Error("不受信任的分片写入请求");
    }
    const startedAt = Date.now();
    console.info("[meeting-capture] fragment received", {
      captureId: input.captureId,
      sequence: input.sequence,
      sizeBytes: bytes.byteLength,
      track: input.track,
    });
    try {
      await store.append(input, bytes);
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > 5000) {
        console.warn("[meeting-capture] slow fragment append", {
          captureId: input.captureId,
          elapsedMs,
          sequence: input.sequence,
          sizeBytes: bytes.byteLength,
          track: input.track,
        });
      }
    } catch (error) {
      console.error("[meeting-capture] fragment append failed", {
        captureId: input.captureId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "UnknownError",
        sequence: input.sequence,
        track: input.track,
      });
      throw error;
    }
  });
}

/**
 * 为可信主文档授予麦克风和系统音频。Electron 39 在系统音频请求中可能返回空 mediaTypes。
 * Grants microphone/system audio only to the trusted main document; Electron 39 may report system capture with empty mediaTypes.
 */
export function registerMeetingCaptureMediaSession(): void {
  const appSession = session.defaultSession;
  appSession.setPermissionCheckHandler((contents, permission, _requestingOrigin, details) => {
    const allowedPermission =
      permission === "media" && (details.mediaType === undefined || details.mediaType === "audio");
    return allowedPermission && isTrustedMainDocument(contents, details);
  });
  appSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const isDisplayMedia = "mediaTypes" in details && details.mediaTypes?.length === 0;
    const isAudioOnly =
      "mediaTypes" in details &&
      details.mediaTypes?.length === 1 &&
      details.mediaTypes[0] === "audio";
    const allowedPermission =
      permission === "display-capture" ||
      (permission === "media" && (isAudioOnly || isDisplayMedia));
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
        console.error("[meeting-capture] display-media grant failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        callback({});
      }
    },
    { useSystemPicker: false },
  );
}
