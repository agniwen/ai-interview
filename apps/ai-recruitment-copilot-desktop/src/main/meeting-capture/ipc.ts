// oxlint-disable promise/prefer-await-to-callbacks -- Electron permission APIs are callback based.
import { desktopCapturer, ipcMain, session } from "electron";
import { z } from "zod";
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
} from "../../preload/meeting-capture";
import type { LocalMeetingRecordingStore } from "./local-meeting-recording-store";
import type {
  MultipartMeetingUploadInstruction,
  SmallMeetingUploadInstruction,
} from "@arc/shared/meeting-recording";
import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import { meetingLiveTranscriptDraftSchema } from "@arc/shared/meeting-transcription";
import { getMainWindowWebContents } from "../window";
import { registerMeetingCaptureMediaSessionHandlers } from "./media-session";

const MAX_FRAGMENT_BYTES = 32 * 1024 * 1024;
const CAPTURE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const captureIdSchema = z.string().regex(CAPTURE_ID_PATTERN);
const contentTypeSchema = z.string().min(1).max(256);
const nonNegativeFiniteNumberSchema = z.number().finite().nonnegative();
const meetingTrackSchema = z.enum(["microphone", "system"]);
const uploadExpirySchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const uploadHeadersSchema = z.object({
  "content-type": contentTypeSchema,
  "x-amz-checksum-sha256": z.string().regex(/^[A-Za-z\d+/]{43}=$/),
  "x-amz-meta-sha256": z.string().regex(/^[a-f\d]{64}$/i),
});
const smallUploadInstructionSchema = z.object({
  contentType: contentTypeSchema,
  expiresAt: uploadExpirySchema,
  headers: uploadHeadersSchema,
  method: z.literal("PUT"),
  sizeBytes: nonNegativeFiniteNumberSchema.int(),
  track: meetingTrackSchema,
  url: z.string().max(8192),
});
const multipartUploadInstructionSchema = z.object({
  expiresAt: uploadExpirySchema,
  headers: z.object({ "content-md5": z.string().regex(/^[A-Za-z\d+/]{22}==$/) }),
  method: z.literal("PUT"),
  offsetBytes: nonNegativeFiniteNumberSchema.int(),
  partNumber: z.number().int().positive().max(10_000),
  sizeBytes: z.number().int().positive(),
  track: meetingTrackSchema,
  url: z.string().max(8192),
});
const beginRequestSchema = z.object({
  captureId: captureIdSchema,
  recruitingRecordId: z.string().nullable(),
  startedAt: z.string(),
  trackContentTypes: z.object({
    microphone: contentTypeSchema,
    system: contentTypeSchema,
  }),
  videoTracksDiscarded: nonNegativeFiniteNumberSchema.int(),
});
const fragmentInputSchema = z.object({
  captureId: captureIdSchema,
  contentType: contentTypeSchema,
  durationMs: nonNegativeFiniteNumberSchema,
  endedAtMonotonicMs: nonNegativeFiniteNumberSchema,
  sequence: nonNegativeFiniteNumberSchema.int(),
  startedAtMonotonicMs: nonNegativeFiniteNumberSchema,
  track: meetingTrackSchema,
});
const recoveryCopyDeleteAfterSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)));
const trackContentTypesSchema = z.object({
  microphone: contentTypeSchema,
  system: contentTypeSchema,
});
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

export function isTrustedMainFrame(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isTrustedApplicationContents(event.sender) && event.senderFrame === event.sender.mainFrame;
}

function isCaptureId(value: unknown): value is string {
  return captureIdSchema.safeParse(value).success;
}

function isUploadInstruction(value: unknown): value is SmallMeetingUploadInstruction {
  return smallUploadInstructionSchema.safeParse(value).success;
}

function isMultipartUploadInstruction(value: unknown): value is MultipartMeetingUploadInstruction {
  return multipartUploadInstructionSchema.safeParse(value).success;
}

function isBeginRequest(input: unknown): input is BeginLocalCaptureInput {
  return beginRequestSchema.safeParse(input).success;
}

function isFragmentInput(input: unknown): input is AppendLocalFragmentInput {
  return fragmentInputSchema.safeParse(input).success;
}

function isFragmentBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= MAX_FRAGMENT_BYTES
  );
}

async function logCaptureOperation<Result>(
  operation: string,
  run: () => Promise<Result>,
): Promise<Result> {
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
        !recoveryCopyDeleteAfterSchema.safeParse(recoveryCopyDeleteAfter).success
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
      !trackContentTypesSchema.safeParse(trackContentTypes).success
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
  registerMeetingCaptureMediaSessionHandlers({
    getMainWindowWebContents,
    getSources: (options) => desktopCapturer.getSources(options),
    setDisplayMediaRequestHandler: (handler, options) =>
      appSession.setDisplayMediaRequestHandler(handler, options),
    setPermissionCheckHandler: (handler) => appSession.setPermissionCheckHandler(handler),
    setPermissionRequestHandler: (handler) => appSession.setPermissionRequestHandler(handler),
  });
}
