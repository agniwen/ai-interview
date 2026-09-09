import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export async function loadEchoDeviceId(path: string): Promise<string> {
  try {
    const stored = await readFile(path, "utf-8");
    return z.uuid().parse(stored.trim());
  } catch (error) {
    const missing = z.object({ code: z.literal("ENOENT") }).safeParse(error);
    if (!missing.success) {
      throw error;
    }
  }
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const id = randomUUID();
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(id);
    await file.sync();
  } finally {
    await file.close();
  }
  return id;
}
