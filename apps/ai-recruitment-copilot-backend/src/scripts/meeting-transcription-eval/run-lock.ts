import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

interface RunLockOwner {
  pid: number;
  token: string;
}

function parseOwner(value: string): RunLockOwner | null {
  try {
    const owner = JSON.parse(value) as { pid?: unknown; token?: unknown };
    return typeof owner.pid === "number" &&
      Number.isInteger(owner.pid) &&
      typeof owner.token === "string" &&
      owner.token.length > 0
      ? { pid: owner.pid, token: owner.token }
      : null;
  } catch {
    return null;
  }
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
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
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
