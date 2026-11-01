import { generateHumanInterviewEvaluation } from "@app/meeting-processing/human-interview";
import { enqueueHumanInterviewEvaluationReady } from "@app/recruiting-workflows/notifications/human-evaluation-ready";
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
