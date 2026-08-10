// oxlint-disable promise/prefer-await-to-then -- The per-capture promise chain is the serialization primitive.
import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";
import type {
  CreateSmallSavedMeetingInput,
  MeetingSourceTrack,
  MultipartMeetingUploadInstruction,
  MultipartSavedMeetingDescriptor,
  SmallMeetingUploadInstruction,
} from "@arc/shared/meeting-recording";
import { MEETING_MULTIPART_PART_BYTES } from "@arc/shared/meeting-recording";
import {
  describeLocalMeetingMultipart,
  uploadMeetingObject,
  uploadLocalMeetingMultipart,
} from "./local-meeting-multipart";
import type { MeetingObjectUploader } from "./local-meeting-multipart";
import type {
  AppendLocalFragmentInput,
  BeginLocalCaptureInput,
  CaptureTrack,
  LocalSavedMeeting,
  MeetingRecordingStore,
  RecordingTrackSummary,
  RecoverableMeetingCapture,
} from "../../preload/meeting-capture";

const MANIFEST_VERSION = 1;
const CAPTURE_ID_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const TRACKS = new Set<CaptureTrack>(["microphone", "system"]);

interface LocalMeetingRecordingStoreOptions {
  allowedUploadOrigin?: string;
  multipartPartSizeBytes?: number;
  now?: () => Date;
  putObject?: MeetingObjectUploader;
}

const jsonBytes = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/**
 * 原子写入文件并同步父目录，确保掉电或进程崩溃后只会看到旧版本或完整新版本。
 * Atomically writes a file and fsyncs its parent so crashes expose either the old or complete new version.
 */
async function atomicWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { mode: 0o700, recursive: true });
  await writeFileAtomic(filePath, Buffer.from(bytes), { fsync: true, mode: 0o600 });
  const directory = await open(dirname(filePath), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function assertCaptureId(captureId: string): void {
  if (!CAPTURE_ID_PATTERN.test(captureId)) {
    throw new Error("无效的本地录制编号");
  }
}

function extensionFor(contentType: string): string {
  if (contentType.includes("mp4")) {
    return ".mp4";
  }
  return ".webm";
}

const isoDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const contentTypeSchema = z.string().min(1).max(256);
const storedFragmentSchema = z
  .object({
    contentType: contentTypeSchema,
    durationMs: z.number().finite().nonnegative(),
    endedAtMonotonicMs: z.number().finite().nonnegative(),
    localPath: z.string(),
    sequence: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f\d]{64}$/i),
    sizeBytes: z.number().int().nonnegative(),
    startedAtMonotonicMs: z.number().finite().nonnegative(),
    track: z.enum(["microphone", "system"]),
  })
  .refine((fragment) => fragment.endedAtMonotonicMs >= fragment.startedAtMonotonicMs)
  .refine(
    (fragment) =>
      fragment.localPath ===
      join(
        "fragments",
        fragment.track,
        `${String(fragment.sequence).padStart(8, "0")}${extensionFor(fragment.contentType)}`,
      ),
  );
const storedManifestSchema = z.object({
  captureId: z.string().regex(CAPTURE_ID_PATTERN),
  container: z.object({
    independentlyDecodableFragments: z.literal(false),
    kind: z.literal("ordered-mediarecorder-stream"),
  }),
  endedAt: isoDateSchema.nullable(),
  fragments: z.array(storedFragmentSchema),
  manifestSha256: z
    .string()
    .regex(/^[a-f\d]{64}$/i)
    .optional(),
  manifestVersion: z.literal(MANIFEST_VERSION),
  possibleTailGap: z.boolean(),
  recruitingRecordId: z.string().nullable(),
  savedAt: isoDateSchema.nullable(),
  startedAt: isoDateSchema,
  status: z.enum(["recording", "interrupted", "saved-local"]),
  trackContentTypes: z.object({
    microphone: contentTypeSchema,
    system: contentTypeSchema,
  }),
  videoTracksDiscarded: z.number().int().nonnegative(),
  videoTracksPersisted: z.literal(0),
});
const saveIntentSchema = z
  .object({
    captureId: z.string().regex(CAPTURE_ID_PATTERN),
    manifestSha256: z.string().regex(/^[a-f\d]{64}$/i),
    recoveryCopyDeleteAfter: isoDateSchema.nullable(),
    savedAt: isoDateSchema,
    status: z.enum(["pending-server-save", "workspace-verified"]),
  })
  .refine(
    (intent) => intent.status === "pending-server-save" || intent.recoveryCopyDeleteAfter !== null,
  );
type StoredFragment = z.infer<typeof storedFragmentSchema>;
type StoredManifest = z.infer<typeof storedManifestSchema>;
type SaveIntent = z.infer<typeof saveIntentSchema>;

function parseStoredManifest(value: unknown, captureId: string): StoredManifest {
  const parsed = storedManifestSchema.safeParse(value);
  if (!parsed.success || parsed.data.captureId !== captureId) {
    throw new Error("本地录音清单结构无效");
  }
  return parsed.data;
}

function emptyTrackSummary(): Record<CaptureTrack, RecordingTrackSummary> {
  return {
    microphone: { bytes: 0, committedThroughMs: 0, fragmentCount: 0 },
    system: { bytes: 0, committedThroughMs: 0, fragmentCount: 0 },
  };
}

function summarize(fragments: StoredFragment[]): Record<CaptureTrack, RecordingTrackSummary> {
  const tracks = emptyTrackSummary();
  for (const fragment of fragments) {
    const track = tracks[fragment.track];
    track.bytes += fragment.sizeBytes;
    track.committedThroughMs = fragment.endedAtMonotonicMs;
    track.fragmentCount += 1;
  }
  return tracks;
}

function manifestDigest(manifest: StoredManifest): string {
  const { manifestSha256: _manifestSha256, ...digestible } = manifest;
  return sha256(JSON.stringify(digestible));
}

function savedMeeting(manifest: StoredManifest): LocalSavedMeeting {
  if (!(manifest.savedAt && manifest.manifestSha256)) {
    throw new Error("本地保存清单不完整");
  }
  return {
    captureId: manifest.captureId,
    container: manifest.container,
    manifestSha256: manifest.manifestSha256,
    possibleTailGap: manifest.possibleTailGap,
    recruitingRecordId: manifest.recruitingRecordId,
    savedAt: manifest.savedAt,
    startedAt: manifest.startedAt,
    status: "saved-local",
    tracks: summarize(manifest.fragments),
  };
}

/**
 * Main 进程中的本地录音事实源：按 Capture 串行落盘双轨分片、冻结清单并恢复已校验前缀。
 * Main-process source of truth for serializing dual-track fragments, freezing manifests, and recovering verified prefixes.
 *
 * MediaRecorder 分片必须按顺序拼接，不能当作独立可解码文件。
 * MediaRecorder fragments are ordered stream pieces and are not independently decodable files.
 */
export class LocalMeetingRecordingStore implements MeetingRecordingStore {
  private readonly allowedUploadOrigin: URL | null;
  private readonly multipartPartSizeBytes: number;
  private readonly now: () => Date;
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly putObject: MeetingObjectUploader;
  private readonly root: string;

  constructor(root: string, options: LocalMeetingRecordingStoreOptions = {}) {
    const configuredOrigin =
      options.allowedUploadOrigin ?? import.meta.env.VITE_RECORDING_R2_UPLOAD_ORIGIN;
    if (configuredOrigin) {
      try {
        this.allowedUploadOrigin = new URL(configuredOrigin);
      } catch {
        throw new Error("Recording R2 上传源地址不是合法 URL");
      }
    } else {
      this.allowedUploadOrigin = null;
    }
    this.multipartPartSizeBytes = options.multipartPartSizeBytes ?? MEETING_MULTIPART_PART_BYTES;
    if (!(Number.isSafeInteger(this.multipartPartSizeBytes) && this.multipartPartSizeBytes > 0)) {
      throw new Error("multipart part 大小必须是正整数");
    }
    this.now = options.now ?? (() => new Date());
    this.putObject = options.putObject ?? uploadMeetingObject;
    this.root = root;
  }

  private capturesRoot() {
    return join(this.root, "captures");
  }

  private captureDirectory(captureId: string) {
    assertCaptureId(captureId);
    return join(this.capturesRoot(), captureId);
  }

  private manifestPath(captureId: string) {
    return join(this.captureDirectory(captureId), "manifest.json");
  }

  private saveIntentPath(captureId: string) {
    return join(this.captureDirectory(captureId), "save-intent.json");
  }

  private activeLockPath() {
    return join(this.root, "active-capture.lock");
  }

  private async readManifest(captureId: string): Promise<StoredManifest> {
    const contents = await readFile(this.manifestPath(captureId), "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new Error("本地录音清单 JSON 损坏");
    }
    return parseStoredManifest(parsed, captureId);
  }

  private async writeManifest(manifest: StoredManifest): Promise<void> {
    await atomicWrite(this.manifestPath(manifest.captureId), jsonBytes(manifest));
  }

  private enqueue<T>(captureId: string, operation: () => Promise<T>): Promise<T> {
    // 同一 Capture 的 append/save/discard 必须线性化，避免终态操作越过仍在落盘的分片。
    // Mutations for one capture are linearized so terminal operations cannot overtake fragment writes.
    const previous = this.operations.get(captureId) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    this.operations.set(captureId, current);
    const cleanup = () => {
      if (this.operations.get(captureId) === current) {
        this.operations.delete(captureId);
      }
    };
    void current.then(cleanup, cleanup);
    return current;
  }

  async begin(input: BeginLocalCaptureInput): Promise<void> {
    assertCaptureId(input.captureId);
    await mkdir(this.root, { mode: 0o700, recursive: true });
    let lock: Awaited<ReturnType<typeof open>>;
    try {
      lock = await open(this.activeLockPath(), "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("此电脑已有一个正在录制的会议", { cause: error });
      }
      throw error;
    }
    try {
      await lock.writeFile(input.captureId);
      await lock.sync();
    } finally {
      await lock.close();
    }

    const manifest: StoredManifest = {
      captureId: input.captureId,
      container: {
        independentlyDecodableFragments: false,
        kind: "ordered-mediarecorder-stream",
      },
      endedAt: null,
      fragments: [],
      manifestVersion: MANIFEST_VERSION,
      possibleTailGap: false,
      recruitingRecordId: input.recruitingRecordId,
      savedAt: null,
      startedAt: input.startedAt,
      status: "recording",
      trackContentTypes: input.trackContentTypes,
      videoTracksDiscarded: input.videoTracksDiscarded,
      videoTracksPersisted: 0,
    };
    try {
      await mkdir(this.captureDirectory(input.captureId), { mode: 0o700, recursive: false });
      await this.writeManifest(manifest);
    } catch (error) {
      try {
        await unlink(this.activeLockPath());
      } catch {
        // The original spool creation error remains primary.
      }
      await rm(this.captureDirectory(input.captureId), { force: true, recursive: true });
      throw error;
    }
  }

  append(input: AppendLocalFragmentInput, bytes: Uint8Array): Promise<void> {
    return this.enqueue(input.captureId, async () => {
      const startedAt = Date.now();
      const manifest = await this.readManifest(input.captureId);
      const manifestReadMs = Date.now() - startedAt;
      if (manifest.status !== "recording") {
        console.error("[meeting-capture] append rejected by manifest status", {
          captureId: input.captureId,
          sequence: input.sequence,
          status: manifest.status,
          track: input.track,
        });
        throw new Error(`录制状态为 ${manifest.status}，不能写入新分片`);
      }
      if (!TRACKS.has(input.track)) {
        throw new Error("未知的录音轨道");
      }
      const trackFragments = manifest.fragments.filter(
        (fragment) => fragment.track === input.track,
      );
      if (input.sequence !== trackFragments.length) {
        throw new Error(
          `${input.track} 分片顺序错误：期望 ${trackFragments.length}，收到 ${input.sequence}`,
        );
      }
      const relativePath = join(
        "fragments",
        input.track,
        `${String(input.sequence).padStart(8, "0")}${extensionFor(input.contentType)}`,
      );
      await atomicWrite(join(this.captureDirectory(input.captureId), relativePath), bytes);
      const fragmentWriteMs = Date.now() - startedAt - manifestReadMs;
      manifest.fragments.push({
        contentType: input.contentType,
        durationMs: input.durationMs,
        endedAtMonotonicMs: input.endedAtMonotonicMs,
        localPath: relativePath,
        sequence: input.sequence,
        sha256: sha256(bytes),
        sizeBytes: bytes.byteLength,
        startedAtMonotonicMs: input.startedAtMonotonicMs,
        track: input.track,
      });
      await this.writeManifest(manifest);
      const totalMs = Date.now() - startedAt;
      if (totalMs > 3000) {
        console.warn("[meeting-capture] slow append stages", {
          captureId: input.captureId,
          fragmentWriteMs,
          manifestReadMs,
          manifestWriteMs: totalMs - fragmentWriteMs - manifestReadMs,
          sequence: input.sequence,
          totalMs,
          track: input.track,
        });
      }
    });
  }

  private async verifiedPrefix(manifest: StoredManifest): Promise<{
    fragments: StoredFragment[];
    truncated: boolean;
  }> {
    // 恢复只信任序号连续且大小、SHA-256 都匹配的前缀；损坏尾部永不进入后续上传。
    // Recovery trusts only a contiguous size-and-SHA-256-verified prefix; a damaged tail is never uploaded.
    const expected: Record<CaptureTrack, number> = { microphone: 0, system: 0 };
    const verified: StoredFragment[] = [];
    let truncated = false;
    for (const fragment of manifest.fragments) {
      if (fragment.sequence !== expected[fragment.track]) {
        truncated = true;
        continue;
      }
      try {
        const filePath = join(this.captureDirectory(manifest.captureId), fragment.localPath);
        const bytes = await readFile(filePath);
        const fileStat = await stat(filePath);
        if (fileStat.size !== fragment.sizeBytes || sha256(bytes) !== fragment.sha256) {
          truncated = true;
          continue;
        }
      } catch {
        truncated = true;
        continue;
      }
      expected[fragment.track] += 1;
      verified.push(fragment);
    }
    return { fragments: verified, truncated };
  }

  save(captureId: string): Promise<LocalSavedMeeting> {
    return this.enqueue(captureId, async () => {
      const manifest = await this.readManifest(captureId);
      if (manifest.status === "saved-local") {
        await this.verifySavedManifestAndIntent(manifest);
        return savedMeeting(manifest);
      }
      if (manifest.status !== "recording" && manifest.status !== "interrupted") {
        throw new Error("当前本地录音不能保存");
      }
      const verification = await this.verifiedPrefix(manifest);
      if (verification.truncated || verification.fragments.length !== manifest.fragments.length) {
        throw new Error("录音分片校验失败，未创建本地保存意图");
      }
      const savedAt = new Date().toISOString();
      manifest.endedAt = savedAt;
      manifest.fragments = verification.fragments;
      manifest.possibleTailGap = manifest.status === "interrupted";
      manifest.savedAt = savedAt;
      manifest.status = "saved-local";
      manifest.manifestSha256 = manifestDigest(manifest);
      await this.writeManifest(manifest);
      const intent: SaveIntent = {
        captureId,
        manifestSha256: manifest.manifestSha256,
        recoveryCopyDeleteAfter: null,
        savedAt,
        status: "pending-server-save",
      };
      await atomicWrite(this.saveIntentPath(captureId), jsonBytes(intent));
      await this.releaseActiveLock(captureId);
      return savedMeeting(manifest);
    });
  }

  async describeWorkspaceSave(captureId: string): Promise<CreateSmallSavedMeetingInput> {
    const manifest = await this.readManifest(captureId);
    if (!(manifest.savedAt && manifest.manifestSha256 && manifest.status === "saved-local")) {
      throw new Error("本地录音尚未冻结，不能保存到工作区");
    }
    await this.verifySavedManifestAndIntent(manifest);
    const assets = await Promise.all(
      (["microphone", "system"] as const).map(async (track) => {
        const fragments = manifest.fragments
          .filter((fragment) => fragment.track === track)
          .toSorted((left, right) => left.sequence - right.sequence);
        const hash = createHash("sha256");
        for (const fragment of fragments) {
          hash.update(await readFile(join(this.captureDirectory(captureId), fragment.localPath)));
        }
        const summary = summarize(fragments)[track];
        return {
          contentType: manifest.trackContentTypes[track],
          durationMs: summary.committedThroughMs,
          fragmentCount: summary.fragmentCount,
          sha256: hash.digest("hex"),
          sizeBytes: summary.bytes,
          track,
        };
      }),
    );
    return {
      assets,
      id: manifest.captureId,
      manifestSha256: manifest.manifestSha256,
      savedAt: manifest.savedAt,
      startedAt: manifest.startedAt,
    };
  }

  async uploadSmall(
    captureId: string,
    instructions: SmallMeetingUploadInstruction[],
  ): Promise<void> {
    const descriptor = await this.describeWorkspaceSave(captureId);
    if (instructions.length !== 2) {
      throw new Error("工作区未返回完整的双轨上传指令");
    }
    const byTrack = new Map(instructions.map((instruction) => [instruction.track, instruction]));
    await Promise.all(
      descriptor.assets.map((asset) => {
        const instruction = byTrack.get(asset.track);
        if (
          !instruction ||
          instruction.contentType !== asset.contentType ||
          instruction.sizeBytes !== asset.sizeBytes ||
          instruction.method !== "PUT"
        ) {
          throw new Error(`${asset.track} 上传指令与本地录音不匹配`);
        }
        let url: URL;
        try {
          url = new URL(instruction.url);
        } catch {
          throw new Error(`${asset.track} 上传地址无效`);
        }
        if (!this.isAllowedUploadUrl(url)) {
          throw new Error("录音上传地址不属于已配置的 Recording R2");
        }
        const expectedHeaders = {
          "content-type": asset.contentType,
          "x-amz-checksum-sha256": Buffer.from(asset.sha256, "hex").toString("base64"),
          "x-amz-meta-sha256": asset.sha256,
        };
        if (
          instruction.headers["content-type"] !== expectedHeaders["content-type"] ||
          instruction.headers["x-amz-checksum-sha256"] !==
            expectedHeaders["x-amz-checksum-sha256"] ||
          instruction.headers["x-amz-meta-sha256"] !== expectedHeaders["x-amz-meta-sha256"]
        ) {
          throw new Error(`${asset.track} 上传签名完整性信息不匹配`);
        }
        return this.putObject({
          body: this.trackStream(captureId, asset.track),
          headers: expectedHeaders,
          sizeBytes: asset.sizeBytes,
          url: instruction.url,
        });
      }),
    );
  }

  async describeMultipartWorkspaceSave(
    captureId: string,
  ): Promise<MultipartSavedMeetingDescriptor> {
    const descriptor = await this.describeWorkspaceSave(captureId);
    const manifest = await this.readManifest(captureId);
    return describeLocalMeetingMultipart({
      captureDirectory: this.captureDirectory(captureId),
      descriptor,
      fragments: manifest.fragments,
      partSizeBytes: this.multipartPartSizeBytes,
    });
  }

  async uploadMultipart(
    captureId: string,
    instructions: MultipartMeetingUploadInstruction[],
  ): Promise<void> {
    const descriptor = await this.describeMultipartWorkspaceSave(captureId);
    const manifest = await this.readManifest(captureId);
    await uploadLocalMeetingMultipart({
      captureDirectory: this.captureDirectory(captureId),
      descriptor,
      fragments: manifest.fragments,
      instructions,
      isAllowedUploadUrl: (url) => this.isAllowedUploadUrl(url),
      putObject: this.putObject,
    });
  }

  private isAllowedUploadUrl(url: URL): boolean {
    const allowed = this.allowedUploadOrigin;
    if (
      !allowed ||
      allowed.protocol !== "https:" ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return false;
    }
    return url.hostname === allowed.hostname || url.hostname.endsWith(`.${allowed.hostname}`);
  }

  private trackStream(captureId: string, track: MeetingSourceTrack): ReadableStream<Uint8Array> {
    let fragments: StoredFragment[] | null = null;
    let index = 0;
    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (!fragments) {
          const manifest = await this.readManifest(captureId);
          fragments = manifest.fragments
            .filter((fragment) => fragment.track === track)
            .toSorted((left, right) => left.sequence - right.sequence);
        }
        const fragment = fragments[index];
        if (!fragment) {
          controller.close();
          return;
        }
        index += 1;
        controller.enqueue(
          await readFile(join(this.captureDirectory(captureId), fragment.localPath)),
        );
      },
    });
  }

  private async verifySavedManifestAndIntent(manifest: StoredManifest): Promise<SaveIntent> {
    if (!(manifest.manifestSha256 && manifest.savedAt)) {
      throw new Error("本地保存清单缺少完整性信息");
    }
    if (manifest.manifestSha256 !== manifestDigest(manifest)) {
      throw new Error("本地保存清单哈希校验失败");
    }
    const verification = await this.verifiedPrefix(manifest);
    if (verification.truncated || verification.fragments.length !== manifest.fragments.length) {
      throw new Error("本地保存录音的分片校验失败");
    }
    const expected: SaveIntent = {
      captureId: manifest.captureId,
      manifestSha256: manifest.manifestSha256,
      recoveryCopyDeleteAfter: null,
      savedAt: manifest.savedAt,
      status: "pending-server-save",
    };
    try {
      const stored = saveIntentSchema.parse(
        JSON.parse(await readFile(this.saveIntentPath(manifest.captureId), "utf-8")),
      );
      if (
        stored.captureId !== expected.captureId ||
        stored.manifestSha256 !== expected.manifestSha256 ||
        stored.savedAt !== expected.savedAt
      ) {
        throw new Error("本地保存意图与录音清单不一致");
      }
      return {
        ...expected,
        recoveryCopyDeleteAfter: stored.recoveryCopyDeleteAfter ?? null,
        status: stored.status,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      await atomicWrite(this.saveIntentPath(manifest.captureId), jsonBytes(expected));
      return expected;
    }
  }

  markWorkspaceVerified(captureId: string, recoveryCopyDeleteAfter: string): Promise<void> {
    return this.enqueue(captureId, async () => {
      if (Number.isNaN(Date.parse(recoveryCopyDeleteAfter))) {
        throw new TypeError("Local Recording Recovery Copy 清理时间无效");
      }
      const manifest = await this.readManifest(captureId);
      const intent = await this.verifySavedManifestAndIntent(manifest);
      await atomicWrite(
        this.saveIntentPath(captureId),
        jsonBytes({
          ...intent,
          recoveryCopyDeleteAfter,
          status: "workspace-verified",
        } satisfies SaveIntent),
      );
    });
  }

  async discard(captureId: string): Promise<void> {
    assertCaptureId(captureId);
    await this.enqueue(captureId, async () => {
      await rm(this.captureDirectory(captureId), { force: true, recursive: true });
      await this.releaseActiveLock(captureId);
    });
  }

  private async releaseActiveLock(captureId: string): Promise<void> {
    try {
      const activeLock = await readFile(this.activeLockPath(), "utf-8");
      const lockedCaptureId = activeLock.trim();
      if (lockedCaptureId === captureId) {
        await unlink(this.activeLockPath());
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async reconcileActiveLock(): Promise<void> {
    let captureId: string;
    try {
      const lockContents = await readFile(this.activeLockPath(), "utf-8");
      captureId = lockContents.trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (!CAPTURE_ID_PATTERN.test(captureId)) {
      await unlink(this.activeLockPath());
      return;
    }
    try {
      await this.readManifest(captureId);
    } catch {
      await this.releaseActiveLock(captureId);
    }
  }

  async recover(): Promise<RecoverableMeetingCapture[]> {
    // 启动扫描把未正常结束的 recording 降级为 interrupted，并保留仍可安全保存的连续前缀。
    // Startup recovery converts unfinished recordings to interrupted and retains their safely savable prefix.
    await mkdir(this.capturesRoot(), { mode: 0o700, recursive: true });
    await this.reconcileActiveLock();
    const entries = await readdir(this.capturesRoot(), { withFileTypes: true });
    const recoverable: RecoverableMeetingCapture[] = [];
    for (const entry of entries) {
      if (!(entry.isDirectory() && CAPTURE_ID_PATTERN.test(entry.name))) {
        continue;
      }
      try {
        await this.enqueue(entry.name, async () => {
          const manifest = await this.readManifest(entry.name);
          const verification = await this.verifiedPrefix(manifest);
          if (manifest.status === "recording" || manifest.status === "interrupted") {
            const wasRecording = manifest.status === "recording";
            manifest.status = "interrupted";
            manifest.fragments = verification.fragments;
            manifest.possibleTailGap =
              manifest.possibleTailGap || wasRecording || verification.truncated;
            if (wasRecording || verification.truncated) {
              await this.writeManifest(manifest);
            }
          }
          if (manifest.status === "saved-local") {
            const intent = await this.verifySavedManifestAndIntent(manifest);
            if (
              intent.status === "workspace-verified" &&
              intent.recoveryCopyDeleteAfter &&
              Date.parse(intent.recoveryCopyDeleteAfter) <= this.now().getTime()
            ) {
              await rm(this.captureDirectory(manifest.captureId), {
                force: true,
                recursive: true,
              });
              await this.releaseActiveLock(manifest.captureId);
              return;
            }
            await this.releaseActiveLock(manifest.captureId);
            recoverable.push({
              captureId: manifest.captureId,
              manifestSha256: intent.manifestSha256,
              possibleTailGap: manifest.possibleTailGap || verification.truncated,
              recoveryCopyDeleteAfter: intent.recoveryCopyDeleteAfter,
              recruitingRecordId: manifest.recruitingRecordId,
              startedAt: manifest.startedAt,
              status: manifest.status,
              tracks: summarize(verification.fragments),
            });
            return;
          }
          await this.releaseActiveLock(manifest.captureId);
          if (manifest.status === "interrupted") {
            recoverable.push({
              captureId: manifest.captureId,
              possibleTailGap: manifest.possibleTailGap || verification.truncated,
              recoveryCopyDeleteAfter: null,
              recruitingRecordId: manifest.recruitingRecordId,
              startedAt: manifest.startedAt,
              status: manifest.status,
              tracks: summarize(verification.fragments),
            });
          }
        });
      } catch (error) {
        console.error("[meeting-capture] skipped unrecoverable local capture", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        await this.releaseActiveLock(entry.name);
      }
    }
    return recoverable.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt));
  }
}
