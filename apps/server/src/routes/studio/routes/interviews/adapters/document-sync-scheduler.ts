// A database outbox remains recoverable without Redis or notification templates.
export function startHumanInterviewDocumentSyncScheduler(
  processOne: () => Promise<boolean>,
  options: { enabled?: boolean } = {},
) {
  let closed = options.enabled === false;
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
    if (closed) {
      return;
    }
    if (running) {
      return running;
    }
    running = poll();
    try {
      await running;
    } finally {
      running = null;
    }
  }
  const timer = closed ? undefined : setInterval(runOnce, 10_000);
  timer?.unref();
  if (!closed) {
    queueMicrotask(runOnce);
  }
  return {
    async close() {
      closed = true;
      clearInterval(timer);
      await running;
    },
    runOnce,
  };
}
