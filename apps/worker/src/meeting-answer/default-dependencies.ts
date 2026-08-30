import { randomUUID } from "node:crypto";
import {
  claimMeetingAnswerExchange,
  loadMeetingAnswerContext,
  markMeetingAnswerFailed,
  publishMeetingAnswerExchange,
} from "@app/server/server/routes/meetings/answers/dao";
import {
  generateMeetingAnswer,
  getMeetingAnswerGeneratorSnapshot,
} from "@app/server/server/routes/meetings/answers/generator";
import type { MeetingAnswerDependencies } from "./processor";

export const defaultMeetingAnswerDependencies: MeetingAnswerDependencies = {
  claim: claimMeetingAnswerExchange,
  createExecutionToken: randomUUID,
  generate: generateMeetingAnswer,
  generatorSnapshot: getMeetingAnswerGeneratorSnapshot,
  loadContext: loadMeetingAnswerContext,
  markFailed: markMeetingAnswerFailed,
  publish: publishMeetingAnswerExchange,
};
