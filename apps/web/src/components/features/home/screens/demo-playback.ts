export interface DemoPlaybackStep {
  target: string;
  caption: string;
  hold?: number;
  /** 点击后展开的内容区域：停留期间平滑滚动展示它。 Region revealed by the click; scrolled into view during the hold. */
  reveal?: string;
}

export interface DemoPlaybackPort {
  ready: () => Promise<boolean>;
  reset: () => void;
  move: (target: string, caption: string) => Promise<boolean>;
  click: (target: string) => void;
  /** 在给定时长内滚动展示区域；返回 false 表示已中止。 Scrolls a region into view within the budget. */
  reveal?: (selector: string, budget: number) => Promise<boolean>;
}

/** 揭示滚动后至少再停留这么久，让访客读到停下来的画面。 Minimum dwell after a reveal scroll settles. */
const REVEAL_SETTLE_MS = 700;

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
      const hold = step.hold ?? 1700;
      if (step.reveal && port.reveal) {
        const startedAt = Date.now();
        if (!(await port.reveal(step.reveal, hold - REVEAL_SETTLE_MS))) {
          return;
        }
        const remaining = Math.max(REVEAL_SETTLE_MS, hold - (Date.now() - startedAt));
        if (!(await playbackDelay(remaining, signal))) {
          return;
        }
      } else if (!(await playbackDelay(hold, signal))) {
        return;
      }
    }
    if (!(await playbackDelay(3000, signal))) {
      return;
    }
  }
}
