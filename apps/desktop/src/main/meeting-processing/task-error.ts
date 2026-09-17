import { z } from "zod";
import type { TaskFailureKind } from "./task-store";

export class MeetingTaskError extends Error {
  readonly kind: TaskFailureKind;
  constructor(kind: TaskFailureKind, message: string) {
    super(message);
    this.name = "MeetingTaskError";
    this.kind = kind;
  }
}

const networkErrorSchema = z.object({
  code: z.enum(["ENETUNREACH", "ENETDOWN", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN"]),
});

export function classifyMeetingTaskError(error: Error): TaskFailureKind {
  if (error instanceof MeetingTaskError) {
    return error.kind;
  }
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (networkErrorSchema.safeParse(current).success) {
      return "offline";
    }
    if (!(current instanceof Error)) {
      break;
    }
    current = current.cause;
  }
  return "transient";
}
