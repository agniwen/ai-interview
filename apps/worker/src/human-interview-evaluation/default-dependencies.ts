import { generateHumanInterviewEvaluation } from "@app/meeting-processing/human-interview";
import { enqueueHumanInterviewEvaluationReady } from "@app/server/human-interview-evaluation-ready";
import { humanInterviewEvaluationDao } from "../meeting-processing-daos";
import type { HumanInterviewEvaluationProcessorDependencies } from "./processor";

export const defaultHumanInterviewEvaluationDependencies: HumanInterviewEvaluationProcessorDependencies =
  {
    generate: generateHumanInterviewEvaluation,
    loadInput: humanInterviewEvaluationDao.loadHumanInterviewEvaluationInput,
    markFailed: humanInterviewEvaluationDao.markHumanInterviewEvaluationFailed,
    notifyReady: enqueueHumanInterviewEvaluationReady,
    publish: humanInterviewEvaluationDao.publishHumanInterviewEvaluation,
  };
