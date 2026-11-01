import {
  enqueueInitialInterviewEvaluationJobs,
  isInitialInterviewEvaluationQueueConfigured,
} from "@app/job-queues/initial-interview-evaluation";
import { listPendingInitialInterviewVersions } from "./dao";
import { processInitialInterviewVersion } from "./default-process-initial-interview";

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
