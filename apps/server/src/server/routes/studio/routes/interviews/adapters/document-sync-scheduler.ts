// A database outbox remains recoverable without Redis or notification templates.
export function startHumanInterviewDocumentSyncScheduler(processOne: () => Promise<boolean>) {
  let closed = false;
  let running: Promise<void> | null = null;
  async function poll() {
    try {
      for (let count = 0; count < 10; count += 1) {
        if (closed || !(await processOne())) {
          break;
        }
      }
    } catch (error) {
      console.error("[human-interview-document-sync] poll failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  async function runOnce() {
    if (closed || running) {
      return;
    }
    running = poll();
    try {
      await running;
    } finally {
      running = null;
    }
  }
  const timer = setInterval(runOnce, 10_000);
  timer.unref();
  queueMicrotask(runOnce);
  return {
    async close() {
      closed = true;
      clearInterval(timer);
      await running;
    },
    runOnce,
  };
}
