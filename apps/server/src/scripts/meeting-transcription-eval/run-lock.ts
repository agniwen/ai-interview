import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

interface RunLockOwner {
  pid: number;
  token: string;
}

const runLockOwnerSchema = z.object({
  pid: z.number().int(),
  token: z.string().min(1),
});

const filesystemErrorSchema = z.object({ code: z.string().optional() }).passthrough();

type FilesystemError = z.output<typeof filesystemErrorSchema>;

function parseOwner(value: string): RunLockOwner | null {
  try {
    const result = runLockOwnerSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function isLockAlreadyPublished(error: FilesystemError): boolean {
  return error.code === "EEXIST";
}

export async function acquireMeetingTranscriptionBenchmarkRunLock(
  outputPath: string,
): Promise<() => Promise<void>> {
  const lockPath = `${outputPath}.lock`;
  const token = randomUUID();
  const unpublishedPath = `${lockPath}.${process.pid}.${token}.unpublished`;
  await mkdir(dirname(lockPath), { recursive: true });
  const unpublished = await open(unpublishedPath, "wx", 0o600);
  try {
    await unpublished.writeFile(`${JSON.stringify({ pid: process.pid, token })}\n`);
    await unpublished.sync();
    await link(unpublishedPath, lockPath);
  } catch (error) {
    await unpublished.close();
    try {
      await unlink(unpublishedPath);
    } catch {
      // The unpublished inode may already have been cleaned after a failed link.
    }
    const parsedError = filesystemErrorSchema.safeParse(error);
    if (parsedError.success && isLockAlreadyPublished(parsedError.data)) {
      const owner = await readFile(lockPath, "utf-8")
        .then(parseOwner)
        .catch(() => null);
      const ownerDescription = owner ? ` (pid ${owner.pid})` : "";
      throw new Error(
        `Meeting transcription benchmark is already running for ${outputPath}${ownerDescription}. Remove the lock manually only after verifying that no paid run owns it.`,
        { cause: error },
      );
    }
    throw error;
  }
  const publishedIdentity = await stat(lockPath);
  await unpublished.close();
  await unlink(unpublishedPath);
  let released = false;
  return async () => {
    if (released) {
      return;
    }
    released = true;
    const [currentOwner, currentIdentity] = await Promise.all([
      readFile(lockPath, "utf-8")
        .then(parseOwner)
        .catch(() => null),
      stat(lockPath).catch(() => null),
    ]);
    if (
      currentOwner?.token !== token ||
      !currentIdentity ||
      currentIdentity.dev !== publishedIdentity.dev ||
      currentIdentity.ino !== publishedIdentity.ino
    ) {
      throw new Error("Meeting transcription benchmark lock ownership changed before release");
    }
    await unlink(lockPath);
  };
}
