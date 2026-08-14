import { z } from "zod";

export const MEETING_ANSWER_MAX_QUESTION_CHARS = 2000;
export const MEETING_ANSWER_MAX_EXCHANGES_PER_THREAD = 200;
export const MEETING_ANSWER_MAX_THREADS_PER_MEETING = 50;
export const MEETING_ANSWER_REQUEST_BODY_MAX_BYTES = 8 * 1024;
export const MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT = "当前会议资料中没有足够证据回答这个问题。";

export const createMeetingQuestionThreadSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const createMeetingQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(MEETING_ANSWER_MAX_QUESTION_CHARS),
    requestId: z.string().uuid(),
  })
  .strict();

export const meetingAnswerCitationSchema = z
  .object({
    endMs: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    turnId: z.string().min(1),
  })
  .strict()
  .refine((citation) => citation.endMs > citation.startMs, {
    message: "Meeting Answer citation 时间范围无效",
  });

const meetingAnswerTextSchema = z.string().trim().min(1).max(12_000);

export const meetingAnswerPayloadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      citations: z.array(meetingAnswerCitationSchema).min(1).max(20),
      kind: z.literal("answer"),
      text: meetingAnswerTextSchema,
    })
    .strict(),
  z
    .object({
      citations: z.array(meetingAnswerCitationSchema).length(0),
      kind: z.literal("insufficient-evidence"),
      text: z.literal(MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT),
    })
    .strict(),
]);

export const meetingAnswerModelOutputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      citationTurnIds: z.array(z.string().min(1)).min(1).max(20),
      kind: z.literal("answer"),
      text: meetingAnswerTextSchema,
    })
    .strict(),
  z
    .object({
      citationTurnIds: z.array(z.string().min(1)).length(0),
      kind: z.literal("insufficient-evidence"),
      text: meetingAnswerTextSchema,
    })
    .strict(),
]);

export const meetingQuestionStatusSchema = z.enum(["pending", "processing", "ready", "failed"]);

export type MeetingAnswerPayload = z.infer<typeof meetingAnswerPayloadSchema>;
export type MeetingAnswerModelOutput = z.infer<typeof meetingAnswerModelOutputSchema>;
export type CreateMeetingQuestion = z.infer<typeof createMeetingQuestionSchema>;

export class MeetingAnswerTerminalError extends Error {
  readonly terminal = true;

  constructor(message: string) {
    super(message);
    this.name = "MeetingAnswerTerminalError";
  }
}

export function isMeetingAnswerTerminalError(error: unknown): error is MeetingAnswerTerminalError {
  return (
    error instanceof MeetingAnswerTerminalError ||
    (error instanceof Error && "terminal" in error && error.terminal === true)
  );
}

export interface MeetingQuestionExchange {
  answer: MeetingAnswerPayload | null;
  answeredAt: string | null;
  createdAt: string;
  error: string | null;
  id: string;
  question: string;
  requestId: string;
  sequence: number;
  status: z.infer<typeof meetingQuestionStatusSchema>;
}

export interface MeetingQuestionThreadSummary {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
}

export interface MeetingQuestionThread extends MeetingQuestionThreadSummary {
  exchanges: MeetingQuestionExchange[];
  meetingId: string;
}

export function materializeMeetingAnswer(
  output: MeetingAnswerModelOutput,
  turns: { endMs: number; id: string; startMs: number }[],
): MeetingAnswerPayload {
  if (output.kind === "insufficient-evidence") {
    return meetingAnswerPayloadSchema.parse({
      citations: [],
      kind: output.kind,
      text: MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT,
    });
  }
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const citations = [...new Set(output.citationTurnIds)].map((turnId) => {
    const turn = byId.get(turnId);
    if (!turn) {
      throw new Error("Meeting Answer citation 不属于当前转录");
    }
    return { endMs: turn.endMs, startMs: turn.startMs, turnId };
  });
  return meetingAnswerPayloadSchema.parse({
    citations,
    kind: output.kind,
    text: output.text,
  });
}
