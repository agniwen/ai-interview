export interface DemoPlaybackStep {
  target: string;
  caption: string;
  hold?: number;
}

export interface DemoPlaybackPort {
  ready: () => Promise<boolean>;
  reset: () => void;
  move: (target: string, caption: string) => Promise<boolean>;
  click: (target: string) => void;
}

interface PendingPlaybackDelay {
  timer?: ReturnType<typeof setTimeout>;
}

export function playbackDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  if (signal.aborted) {
    resolve(false);
    return promise;
  }
  const pending: PendingPlaybackDelay = {};
  const abort = () => {
    clearTimeout(pending.timer);
    signal.removeEventListener("abort", abort);
    resolve(false);
  };
  pending.timer = setTimeout(() => {
    signal.removeEventListener("abort", abort);
    resolve(true);
  }, ms);
  signal.addEventListener("abort", abort, { once: true });
  return promise;
}

/** No frame-based React state: only the actual demo actions change application state. */
export async function runDemoPlayback(
  port: DemoPlaybackPort,
  steps: DemoPlaybackStep[],
  signal: AbortSignal,
) {
  while (!signal.aborted && (await port.ready())) {
    port.reset();
    if (!(await playbackDelay(1800, signal))) {
      return;
    }
    for (const step of steps) {
      if (signal.aborted || !(await port.ready())) {
        return;
      }
      if (!(await port.move(step.target, step.caption))) {
        return;
      }
      if (!(await playbackDelay(240, signal)) || !(await port.ready()) || signal.aborted) {
        return;
      }
      port.click(step.target);
      if (!(await playbackDelay(step.hold ?? 1700, signal))) {
        return;
      }
    }
    if (!(await playbackDelay(3000, signal))) {
      return;
    }
  }
}
