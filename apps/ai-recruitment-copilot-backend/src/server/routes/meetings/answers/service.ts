import {
  enqueueMeetingAnswerJobs,
  isMeetingAnswerQueueConfigured,
  MEETING_ANSWER_PROMPT_VERSION,
} from "@arc/meeting-processing-queue/meeting-answer";
import type {
  MeetingQuestionExchange,
  MeetingQuestionThread,
  MeetingQuestionThreadSummary,
} from "@arc/shared/meeting-answer";
import { meetingAccessCapabilities } from "../access";
import { loadAuthorizedMeeting, meetingRole } from "../authorized-meeting";
import { recordMeetingAudit } from "../dao";
import {
  createMeetingAnswerExchange,
  createMeetingQuestionThread,
  listMeetingQuestionThreads,
  loadMeetingQuestionThread,
} from "./dao";
import { getMeetingAnswerGeneratorSnapshot } from "./generator";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

interface MeetingQuestionAccessInput {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}

async function authorize(input: MeetingQuestionAccessInput): Promise<boolean> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return false;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canAskQuestions) {
    return false;
  }
  if (role === "administrator") {
    await recordMeetingAudit({
      action: "meeting.questions_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return true;
}

export async function listSavedMeetingQuestionThreads(
  input: MeetingQuestionAccessInput,
): Promise<MeetingQuestionThreadSummary[] | null> {
  if (!(await authorize(input))) {
    return null;
  }
  return await listMeetingQuestionThreads({
    createdBy: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
}

export async function createSavedMeetingQuestionThread(
  input: MeetingQuestionAccessInput & { title?: string },
): Promise<MeetingQuestionThreadSummary | "limit-reached" | null> {
  if (!(await authorize(input))) {
    return null;
  }
  return await createMeetingQuestionThread({
    createdBy: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    title: input.title?.trim() || "新提问",
  });
}

export async function getSavedMeetingQuestionThread(
  input: MeetingQuestionAccessInput & { threadId: string },
): Promise<MeetingQuestionThread | null> {
  if (!(await authorize(input))) {
    return null;
  }
  return await loadMeetingQuestionThread({
    createdBy: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    threadId: input.threadId,
  });
}

export async function askMeetingQuestion(
  input: MeetingQuestionAccessInput & {
    question: string;
    requestId: string;
    threadId: string;
  },
): Promise<
  | MeetingQuestionExchange
  | "active-question"
  | "conflict"
  | "not-ready"
  | "rate-limited"
  | "thread-limit"
  | "unavailable"
  | null
> {
  if (!(await authorize(input))) {
    return null;
  }
  if (!isMeetingAnswerQueueConfigured()) {
    return "unavailable";
  }
  const generator = getMeetingAnswerGeneratorSnapshot();
  const exchange = await createMeetingAnswerExchange({
    createdBy: input.userId,
    meetingId: input.meetingId,
    model: generator.model,
    organizationId: input.organizationId,
    promptVersion: MEETING_ANSWER_PROMPT_VERSION,
    provider: generator.provider,
    question: input.question,
    requestId: input.requestId,
    threadId: input.threadId,
  });
  if (exchange === "not-authorized") {
    return null;
  }
  if (typeof exchange === "string") {
    return exchange;
  }
  try {
    await enqueueMeetingAnswerJobs([{ exchangeId: exchange.id }]);
  } catch (error) {
    console.error("[meeting-answer] failed to enqueue exchange", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      exchangeId: exchange.id,
    });
  }
  return exchange;
}
