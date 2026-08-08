// oxlint-disable promise/prefer-await-to-then -- The per-capture promise chain is the serialization primitive.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
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

interface StoredFragment extends Omit<AppendLocalFragmentInput, "captureId"> {
  localPath: string;
  sha256: string;
  sizeBytes: number;
}

interface StoredManifest {
  captureId: string;
  container: LocalSavedMeeting["container"];
  endedAt: string | null;
  fragments: StoredFragment[];
  manifestSha256?: string;
  manifestVersion: number;
  possibleTailGap: boolean;
  recruitingRecordId: string | null;
  savedAt: string | null;
  startedAt: string;
  status: "recording" | "interrupted" | "saved-local";
  trackContentTypes: Record<CaptureTrack, string>;
  videoTracksDiscarded: number;
  videoTracksPersisted: 0;
}

interface SaveIntent {
  captureId: string;
  manifestSha256: string;
  recoveryCopyDeleteAfter: string | null;
  savedAt: string;
  status: "pending-server-save" | "workspace-verified";
}

const jsonBytes = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

async function atomicWrite(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { mode: 0o700, recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, filePath);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isIsoDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStoredFragment(value: unknown): value is StoredFragment {
  if (!isRecord(value)) {
    return false;
  }
  const { track } = value;
  const { sequence } = value;
  const { contentType } = value;
  if (
    !(track === "microphone" || track === "system") ||
    !(typeof contentType === "string" && contentType.length > 0 && contentType.length <= 256) ||
    !(Number.isInteger(sequence) && isNonNegativeNumber(sequence))
  ) {
    return false;
  }
  const expectedPath = join(
    "fragments",
    track,
    `${String(sequence).padStart(8, "0")}${extensionFor(contentType)}`,
  );
  return (
    value.localPath === expectedPath &&
    typeof value.sha256 === "string" &&
    /^[a-f\d]{64}$/i.test(value.sha256) &&
    Number.isInteger(value.sizeBytes) &&
    isNonNegativeNumber(value.sizeBytes) &&
    isNonNegativeNumber(value.durationMs) &&
    isNonNegativeNumber(value.startedAtMonotonicMs) &&
    isNonNegativeNumber(value.endedAtMonotonicMs) &&
    value.endedAtMonotonicMs >= value.startedAtMonotonicMs
  );
}

function isTrackContentTypes(value: unknown): value is Record<CaptureTrack, string> {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.microphone === "string" &&
    value.microphone.length > 0 &&
    value.microphone.length <= 256 &&
    typeof value.system === "string" &&
    value.system.length > 0 &&
    value.system.length <= 256
  );
}

function hasValidManifestMetadata(value: Record<string, unknown>, captureId: string): boolean {
  const { status } = value;
  return (
    value.manifestVersion === MANIFEST_VERSION &&
    value.captureId === captureId &&
    (status === "recording" || status === "interrupted" || status === "saved-local") &&
    isIsoDateOrNull(value.endedAt) &&
    isIsoDateOrNull(value.savedAt) &&
    typeof value.startedAt === "string" &&
    !Number.isNaN(Date.parse(value.startedAt)) &&
    typeof value.possibleTailGap === "boolean" &&
    (value.recruitingRecordId === null || typeof value.recruitingRecordId === "string") &&
    Number.isInteger(value.videoTracksDiscarded) &&
    isNonNegativeNumber(value.videoTracksDiscarded) &&
    value.videoTracksPersisted === 0 &&
    (value.manifestSha256 === undefined ||
      (typeof value.manifestSha256 === "string" && /^[a-f\d]{64}$/i.test(value.manifestSha256)))
  );
}

function hasValidManifestMedia(value: Record<string, unknown>): boolean {
  const { container, fragments } = value;
  return (
    isTrackContentTypes(value.trackContentTypes) &&
    isRecord(container) &&
    container.kind === "ordered-mediarecorder-stream" &&
    container.independentlyDecodableFragments === false &&
    Array.isArray(fragments) &&
    fragments.every(isStoredFragment)
  );
}

function parseStoredManifest(value: unknown, captureId: string): StoredManifest {
  if (!isRecord(value)) {
    throw new Error("本地录音清单不是对象");
  }
  const valid = hasValidManifestMetadata(value, captureId) && hasValidManifestMedia(value);
  if (!valid) {
    throw new Error("本地录音清单结构无效");
  }
  return value as unknown as StoredManifest;
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
    this.allowedUploadOrigin = configuredOrigin ? new URL(configuredOrigin) : null;
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
    return parseStoredManifest(JSON.parse(contents), captureId);
  }

  private async writeManifest(manifest: StoredManifest): Promise<void> {
    await atomicWrite(this.manifestPath(manifest.captureId), jsonBytes(manifest));
  }

  private enqueue<T>(captureId: string, operation: () => Promise<T>): Promise<T> {
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
    let lock;
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
      const manifest = await this.readManifest(input.captureId);
      if (manifest.status !== "recording") {
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
    });
  }

  private async verifiedPrefix(manifest: StoredManifest): Promise<{
    fragments: StoredFragment[];
    truncated: boolean;
  }> {
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
      descriptor.assets.map(async (asset) => {
        const instruction = byTrack.get(asset.track);
        if (
          !instruction ||
          instruction.contentType !== asset.contentType ||
          instruction.sizeBytes !== asset.sizeBytes ||
          instruction.method !== "PUT"
        ) {
          throw new Error(`${asset.track} 上传指令与本地录音不匹配`);
        }
        const url = new URL(instruction.url);
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
        await this.putObject({
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
      const stored = JSON.parse(
        await readFile(this.saveIntentPath(manifest.captureId), "utf-8"),
      ) as Partial<SaveIntent>;
      if (
        stored.captureId !== expected.captureId ||
        stored.manifestSha256 !== expected.manifestSha256 ||
        stored.savedAt !== expected.savedAt ||
        !(stored.status === "pending-server-save" || stored.status === "workspace-verified") ||
        (stored.status === "workspace-verified" &&
          !(
            typeof stored.recoveryCopyDeleteAfter === "string" &&
            !Number.isNaN(Date.parse(stored.recoveryCopyDeleteAfter))
          ))
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
        console.error("[meeting-capture] skipped unrecoverable local capture", entry.name, error);
        await this.releaseActiveLock(entry.name);
      }
    }
    return recoverable.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt));
  }
}
