import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnApplicationShutdown, BeforeApplicationShutdown } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import { setTimeout as delay } from "node:timers/promises";
import { RuntimeReadinessService } from "./runtime-readiness.service.js";

async function rejectAfterTimeout(timeoutMs: number, signal: AbortSignal): Promise<never> {
  await delay(timeoutMs, undefined, { ref: false, signal });
  throw new Error(`Backend drain exceeded ${timeoutMs}ms`);
}

export interface DrainParticipant {
  drain(): Promise<void>;
  name: string;
}

@Injectable()
export class DrainCoordinatorService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly flushSentry = Sentry.flush.bind(undefined, 5000);
  private readonly logger = new Logger(DrainCoordinatorService.name);
  private readonly participants: DrainParticipant[] = [];
  private drainPromise: Promise<void> | undefined;

  constructor(
    @Inject(RuntimeReadinessService) private readonly readiness: RuntimeReadinessService,
  ) {}

  beforeApplicationShutdown(signal?: string): Promise<void> {
    this.readiness.beginDrain();
    this.logger.log("Backend drain started", { signal });
    this.drainPromise ??= this.drainWithinTimeout();
    return this.drainPromise;
  }

  onApplicationShutdown(): Promise<boolean> {
    return this.flushSentry();
  }

  register(participant: DrainParticipant): () => void {
    this.participants.push(participant);
    return () => {
      const index = this.participants.indexOf(participant);
      if (index !== -1) {
        this.participants.splice(index, 1);
      }
    };
  }

  private async drainWithinTimeout(): Promise<void> {
    const timeoutMs = Number.parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "120000", 10);
    const drain = async () => {
      for (const participant of this.participants) {
        this.logger.log("Draining backend component", { component: participant.name });
        await participant.drain();
      }
    };
    const timeoutController = new AbortController();
    try {
      await Promise.race([drain(), rejectAfterTimeout(timeoutMs, timeoutController.signal)]);
    } finally {
      timeoutController.abort();
    }
  }
}
