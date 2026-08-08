// oxlint-disable promise/prefer-await-to-then -- The per-capture promise chain is the serialization primitive.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  savedAt: string;
  status: "pending-server-save";
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

function emptyTrackSummary(): Record<CaptureTrack, RecordingTrackSummary> {
  return {
    microphone: { bytes: 0, committedThrough: -1, fragmentCount: 0 },
    system: { bytes: 0, committedThrough: -1, fragmentCount: 0 },
  };
}

function summarize(fragments: StoredFragment[]): Record<CaptureTrack, RecordingTrackSummary> {
  const tracks = emptyTrackSummary();
  for (const fragment of fragments) {
    const track = tracks[fragment.track];
    track.bytes += fragment.sizeBytes;
    track.committedThrough = fragment.sequence;
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
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly root: string;

  constructor(root: string) {
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
    return JSON.parse(await readFile(this.manifestPath(captureId), "utf-8")) as StoredManifest;
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
        savedAt,
        status: "pending-server-save",
      };
      await atomicWrite(this.saveIntentPath(captureId), jsonBytes(intent));
      await this.releaseActiveLock(captureId);
      return savedMeeting(manifest);
    });
  }

  private async verifySavedManifestAndIntent(manifest: StoredManifest): Promise<void> {
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
      savedAt: manifest.savedAt,
      status: "pending-server-save",
    };
    try {
      const intent = JSON.parse(
        await readFile(this.saveIntentPath(manifest.captureId), "utf-8"),
      ) as SaveIntent;
      if (
        intent.captureId !== expected.captureId ||
        intent.manifestSha256 !== expected.manifestSha256 ||
        intent.savedAt !== expected.savedAt ||
        intent.status !== expected.status
      ) {
        throw new Error("本地保存意图与录音清单不一致");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      await atomicWrite(this.saveIntentPath(manifest.captureId), jsonBytes(expected));
    }
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

  async recover(): Promise<RecoverableMeetingCapture[]> {
    await mkdir(this.capturesRoot(), { mode: 0o700, recursive: true });
    const entries = await readdir(this.capturesRoot(), { withFileTypes: true });
    const recoverable: RecoverableMeetingCapture[] = [];
    for (const entry of entries) {
      if (!(entry.isDirectory() && CAPTURE_ID_PATTERN.test(entry.name))) {
        continue;
      }
      await this.enqueue(entry.name, async () => {
        const manifest = await this.readManifest(entry.name);
        const verification = await this.verifiedPrefix(manifest);
        if (manifest.status === "recording") {
          manifest.status = "interrupted";
          manifest.fragments = verification.fragments;
          manifest.possibleTailGap = true;
          await this.writeManifest(manifest);
          await this.releaseActiveLock(manifest.captureId);
        }
        if (manifest.status === "saved-local") {
          await this.verifySavedManifestAndIntent(manifest);
        }
        if (manifest.status === "interrupted" || manifest.status === "saved-local") {
          recoverable.push({
            captureId: manifest.captureId,
            possibleTailGap: manifest.possibleTailGap || verification.truncated,
            recruitingRecordId: manifest.recruitingRecordId,
            startedAt: manifest.startedAt,
            status: manifest.status,
            tracks: summarize(verification.fragments),
          });
        }
      });
    }
    return recoverable.toSorted((left, right) => right.startedAt.localeCompare(left.startedAt));
  }
}
