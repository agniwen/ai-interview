import {
  closeInitialInterviewEvaluationQueue,
  createInitialInterviewEvaluationWorker,
  isInitialInterviewEvaluationQueueConfigured,
} from "@app/meeting-processing-queue/initial-interview-evaluation";
import type { reportQueueFailure } from "../sentry";
import type { WorkerLifecycle } from "../effect/lifecycle";
export async function startInitialInterviewProcessing(input: {
  resourceLifecycle: WorkerLifecycle;
  triggerLifecycle: WorkerLifecycle;
  trackRecoveryRun: (run: () => Promise<void>) => Promise<void>;
  onFailure: ReturnType<typeof reportQueueFailure>;
}) {
  const { processInitialInterviewVersion, recoverInitialInterviewEvaluations } =
    await import("@app/server/initial-interview-evaluation");
  input.resourceLifecycle.addFinalizer(
    "initial-interview-queue",
    closeInitialInterviewEvaluationQueue,
  );
  if (isInitialInterviewEvaluationQueueConfigured()) {
    const worker = createInitialInterviewEvaluationWorker(processInitialInterviewVersion);
    worker.on("failed", input.onFailure);
    input.resourceLifecycle.addFinalizer("initial-interview-worker", () => worker.close());
  }
  await recoverInitialInterviewEvaluations();
  const timer = setInterval(() => {
    void input.trackRecoveryRun(recoverInitialInterviewEvaluations);
  }, 60_000);
  timer.unref();
  input.triggerLifecycle.addFinalizer("initial-interview-recovery", () => clearInterval(timer));
}
