import {
  enqueueInitialInterviewEvaluationJobs,
  isInitialInterviewEvaluationQueueConfigured,
} from "@app/meeting-processing-queue/initial-interview-evaluation";
import { listPendingInitialInterviewVersions } from "../../server/routes/studio/routes/resumes/routes/initial-interviews/dao";
import { processInitialInterviewVersion } from "../../server/routes/studio/routes/resumes/routes/initial-interviews/application/default-process-initial-interview";

export { processInitialInterviewVersion };

export async function recoverInitialInterviewEvaluations() {
  const pending = await listPendingInitialInterviewVersions();
  if (isInitialInterviewEvaluationQueueConfigured()) {
    await enqueueInitialInterviewEvaluationJobs(pending);
    return;
  }
  for (const job of pending) {
    try {
      await processInitialInterviewVersion(job);
    } catch (error) {
      console.error("[initial-interview] generation failed", { error, versionId: job.versionId });
    }
  }
}
