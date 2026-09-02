import {
  generateHumanInterviewEvaluation,
  loadHumanInterviewEvaluationInput,
  markHumanInterviewEvaluationFailed,
  publishHumanInterviewEvaluation,
} from "@app/server/worker/human-interview";
import type { HumanInterviewEvaluationProcessorDependencies } from "./processor";

export const defaultHumanInterviewEvaluationDependencies: HumanInterviewEvaluationProcessorDependencies =
  {
    generate: generateHumanInterviewEvaluation,
    loadInput: loadHumanInterviewEvaluationInput,
    markFailed: markHumanInterviewEvaluationFailed,
    publish: publishHumanInterviewEvaluation,
  };
