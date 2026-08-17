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

interface MeetingAnswerAccess {
  role: Parameters<typeof meetingAccessCapabilities>[0];
}
export interface MeetingAnswerDependencies {
  createMeetingAnswerExchange: typeof createMeetingAnswerExchange;
  createMeetingQuestionThread: typeof createMeetingQuestionThread;
  enqueueMeetingAnswerJobs: typeof enqueueMeetingAnswerJobs;
  getMeetingAnswerGeneratorSnapshot: typeof getMeetingAnswerGeneratorSnapshot;
  isMeetingAnswerQueueConfigured: typeof isMeetingAnswerQueueConfigured;
  listMeetingQuestionThreads: typeof listMeetingQuestionThreads;
  loadMeetingAccess: (
    input: Parameters<typeof loadAuthorizedMeeting>[0],
  ) => Promise<MeetingAnswerAccess | null>;
  loadMeetingQuestionThread: typeof loadMeetingQuestionThread;
  recordMeetingAudit: typeof recordMeetingAudit;
}
const defaultDependencies: MeetingAnswerDependencies = {
  createMeetingAnswerExchange,
  createMeetingQuestionThread,
  enqueueMeetingAnswerJobs,
  getMeetingAnswerGeneratorSnapshot,
  isMeetingAnswerQueueConfigured,
  listMeetingQuestionThreads,
  loadMeetingAccess: async (input) => {
    const meeting = await loadAuthorizedMeeting(input);
    return meeting ? { role: meetingRole(meeting, input) } : null;
  },
  loadMeetingQuestionThread,
  recordMeetingAudit,
};

interface MeetingQuestionAccessInput {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}

async function authorize(
  input: MeetingQuestionAccessInput,
  dependencies: MeetingAnswerDependencies,
): Promise<boolean> {
  const meeting = await dependencies.loadMeetingAccess(input);
  if (!meeting) {
    return false;
  }
  const { role } = meeting;
  if (!meetingAccessCapabilities(role).canAskQuestions) {
    return false;
  }
  if (role === "administrator") {
    await dependencies.recordMeetingAudit({
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
  dependencies: MeetingAnswerDependencies = defaultDependencies,
): Promise<MeetingQuestionThreadSummary[] | null> {
  if (!(await authorize(input, dependencies))) {
    return null;
  }
  return await dependencies.listMeetingQuestionThreads({
    createdBy: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
}

export async function createSavedMeetingQuestionThread(
  input: MeetingQuestionAccessInput & { title?: string },
  dependencies: MeetingAnswerDependencies = defaultDependencies,
): Promise<MeetingQuestionThreadSummary | "limit-reached" | null> {
  if (!(await authorize(input, dependencies))) {
    return null;
  }
  return await dependencies.createMeetingQuestionThread({
    createdBy: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    title: input.title?.trim() || "新提问",
  });
}

export async function getSavedMeetingQuestionThread(
  input: MeetingQuestionAccessInput & { threadId: string },
  dependencies: MeetingAnswerDependencies = defaultDependencies,
): Promise<MeetingQuestionThread | null> {
  if (!(await authorize(input, dependencies))) {
    return null;
  }
  return await dependencies.loadMeetingQuestionThread({
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
  dependencies: MeetingAnswerDependencies = defaultDependencies,
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
  if (!(await authorize(input, dependencies))) {
    return null;
  }
  if (!dependencies.isMeetingAnswerQueueConfigured()) {
    return "unavailable";
  }
  const generator = dependencies.getMeetingAnswerGeneratorSnapshot();
  const exchange = await dependencies.createMeetingAnswerExchange({
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
  if (
    exchange === "active-question" ||
    exchange === "conflict" ||
    exchange === "not-ready" ||
    exchange === "rate-limited" ||
    exchange === "thread-limit"
  ) {
    return exchange;
  }
  try {
    await dependencies.enqueueMeetingAnswerJobs([{ exchangeId: exchange.id }]);
  } catch (error) {
    console.error("[meeting-answer] failed to enqueue exchange", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      exchangeId: exchange.id,
    });
  }
  return exchange;
}
