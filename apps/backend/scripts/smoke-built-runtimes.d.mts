import type { EventEmitter } from "node:events";

export interface SmokeChild extends EventEmitter {
  exitCode: number | null;
  kill(signal: NodeJS.Signals): boolean;
}

export interface SmokeJob {
  failedReason?: string;
  getState(): Promise<string>;
  remove(): Promise<void>;
}

export interface SmokeQueue {
  getJob(jobId: string): Promise<SmokeJob | undefined>;
}

export function stop(child: SmokeChild, output?: () => string, timeoutMs?: number): Promise<void>;

export function waitForCompletedJob(input: {
  child: SmokeChild;
  jobId: string;
  output: () => string;
  pollMs?: number;
  queue: SmokeQueue;
  timeoutMs?: number;
}): Promise<SmokeJob>;
