import { generateHumanInterviewEvaluation } from "@app/meeting-processing/human-interview";
import { humanInterviewEvaluationDao } from "../meeting-processing-daos";
import type { HumanInterviewEvaluationProcessorDependencies } from "./processor";

export const defaultHumanInterviewEvaluationDependencies: HumanInterviewEvaluationProcessorDependencies =
  {
    generate: generateHumanInterviewEvaluation,
    loadInput: humanInterviewEvaluationDao.loadHumanInterviewEvaluationInput,
    markFailed: humanInterviewEvaluationDao.markHumanInterviewEvaluationFailed,
    publish: humanInterviewEvaluationDao.publishHumanInterviewEvaluation,
  };
