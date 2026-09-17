import { createHash } from "node:crypto";
import type { z } from "zod";
import type { MeetingTaskStore } from "./task-store";
import { MeetingTaskError } from "./task-error";

export function echoOperationId(...parts: string[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function readTaskOutput<T>(
  store: MeetingTaskStore,
  meetingId: string,
  kind: string,
  schema: z.ZodType<T>,
): T {
  const task = store
    .list(meetingId)
    .find((candidate) => candidate.kind === kind && candidate.state === "succeeded");
  if (!task?.output) {
    throw new MeetingTaskError("invalid", `缺少已完成的 ${kind} 产物`);
  }
  return schema.parse(JSON.parse(task.output));
}
