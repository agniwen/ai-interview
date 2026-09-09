import { z } from "zod";
import { createMeetingAnswerDao, generateMeetingAnswer } from "@app/meeting-processing/answer";
import {
  meetingAnswerPayloadSchema,
  createMeetingQuestionSchema,
} from "@app/shared/meeting-answer";
import { echoDeviceOperationSchema } from "@app/shared/meeting-device-processing";
import { MEETING_ANSWER_PROMPT_VERSION } from "@app/meeting-processing-queue/meeting-answer";
import { db } from "../../../../../lib/server/db";
import { createMeetingAnswerExchange } from "../../answers/dao";
import { getMeetingAnswerGeneratorSnapshot } from "../../answers/service";
import type { EchoProcessingActor } from "./ownership-dao";
import { assertEchoDeviceOwnership } from "./ownership-dao";
import { runEchoRequest } from "./service";
import { createEchoRequestDao } from "./request-dao";
import { EchoProcessingError } from "./error";

const answers = createMeetingAnswerDao(db, "device");
const requests = createEchoRequestDao(db);
export const echoQuestionStartSchema = createMeetingQuestionSchema.extend({
  threadId: z.string().min(1),
});
export const echoQuestionGenerateSchema = echoDeviceOperationSchema.extend({
  exchangeId: z.string().min(1),
});
export const echoQuestionSyncSchema = echoDeviceOperationSchema.extend({
  generationOperationId: z.uuid(),
});
const generatedSchema = z.object({
  answer: meetingAnswerPayloadSchema,
  exchangeId: z.string(),
  executionToken: z.string(),
});

export async function startEchoQuestion(
  input: EchoProcessingActor & z.infer<typeof echoQuestionStartSchema>,
) {
  const meeting = await db.query.meetingSession.findFirst({
    columns: { processingEpoch: true },
    where: { id: input.meetingId, organizationId: input.organizationId },
  });
  if (!meeting) {
    throw new EchoProcessingError(404, "录音不存在");
  }
  const actor = { ...input, access: "question" as const, epoch: meeting.processingEpoch };
  await assertEchoDeviceOwnership(db, actor);
  const result = await createMeetingAnswerExchange({
    ...input,
    ...getMeetingAnswerGeneratorSnapshot(),
    createdBy: input.userId,
    processingOwner: "device",
    promptVersion: MEETING_ANSWER_PROMPT_VERSION,
  });
  if (
    result === "conflict" ||
    result === "not-authorized" ||
    result === "not-ready" ||
    result === "rate-limited" ||
    result === "active-question" ||
    result === "thread-limit"
  ) {
    throw new EchoProcessingError(result === "rate-limited" ? 429 : 409, `暂时无法提问：${result}`);
  }
  return { epoch: meeting.processingEpoch, exchange: result, exchangeId: result.id };
}

export async function generateEchoQuestion(
  input: EchoProcessingActor & z.infer<typeof echoQuestionGenerateSchema>,
) {
  const exchange = await db.query.meetingQuestionExchange.findFirst({
    where: {
      createdBy: input.userId,
      id: input.exchangeId,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    },
  });
  if (!exchange) {
    throw new EchoProcessingError(404, "提问不存在");
  }
  return runEchoRequest(
    { ...input, access: "question", kind: "question-generate", payload: z.json().parse(input) },
    async () => {
      const current = await answers.claimMeetingAnswerExchange({
        attempt: 1,
        exchangeId: input.exchangeId,
        executionToken: input.operationId,
      });
      if (current.status === "already-ready" && exchange.answer) {
        return {
          answer: meetingAnswerPayloadSchema.parse(exchange.answer),
          exchangeId: exchange.id,
          executionToken: input.operationId,
        };
      }
      if (current.status !== "claimed") {
        throw new EchoProcessingError(409, "提问正在处理或输入已更新");
      }
      const context = await answers.loadMeetingAnswerContext({
        exchangeId: input.exchangeId,
        executionToken: input.operationId,
      });
      if (!context) {
        throw new EchoProcessingError(409, "提问输入已变化");
      }
      try {
        const answer = await generateMeetingAnswer({ ...context, question: current.question });
        return { answer, exchangeId: exchange.id, executionToken: input.operationId };
      } catch (error) {
        await answers.markMeetingAnswerFailed({
          exchangeId: input.exchangeId,
          executionToken: input.operationId,
          terminal: false,
        });
        throw error;
      }
    },
  );
}

export function synchronizeEchoQuestion(
  input: EchoProcessingActor & z.infer<typeof echoQuestionSyncSchema>,
) {
  return runEchoRequest(
    { ...input, access: "question", kind: "question-sync", payload: z.json().parse(input) },
    async () => {
      const result = generatedSchema.parse(
        await requests.read({
          ...input,
          access: "question",
          kind: "question-generate",
          operationId: input.generationOperationId,
        }),
      );
      const existing = await db.query.meetingQuestionExchange.findFirst({
        where: { createdBy: input.userId, id: result.exchangeId, meetingId: input.meetingId },
      });
      if (existing?.status === "ready") {
        return { synchronized: true };
      }
      if (!(await answers.publishMeetingAnswerExchange(result))) {
        throw new EchoProcessingError(409, "会议转录已更新，本地回答已保留");
      }
      return { synchronized: true };
    },
  );
}
