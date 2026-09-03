import { randomUUID } from "node:crypto";
import {
  claimMeetingAnswerExchange,
  loadMeetingAnswerContext,
  markMeetingAnswerFailed,
  publishMeetingAnswerExchange,
} from "./dao";
import { generateMeetingAnswer, getMeetingAnswerGeneratorSnapshot } from "./generator";
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
