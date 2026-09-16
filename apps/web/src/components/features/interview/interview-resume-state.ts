import { z } from "zod";

const resumeStateSchema = z.object({
  microphoneEnabled: z.boolean(),
  roomName: z.string().min(1),
  startedAt: z.number().nonnegative().nullable(),
});
type InterviewResumeState = z.infer<typeof resumeStateSchema>;

export function parseInterviewResumeState(value: string | null): InterviewResumeState | null {
  try {
    const result = resumeStateSchema.safeParse(JSON.parse(value ?? "null"));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function readInterviewResumeState(key: string): InterviewResumeState | null {
  try {
    return parseInterviewResumeState(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeInterviewResumeState(key: string, value: InterviewResumeState): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Optional UI recovery must not prevent the interview when storage is blocked.
  }
}
