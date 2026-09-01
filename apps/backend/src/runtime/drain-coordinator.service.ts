import { Inject, Injectable, Logger } from "@nestjs/common";
import type { BeforeApplicationShutdown } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import { setTimeout as delay } from "node:timers/promises";
import { BackendConfigService } from "../config/backend-config.service.js";
import { RuntimeReadinessService } from "./runtime-readiness.service.js";

async function rejectAfterTimeout(timeoutMs: number, signal: AbortSignal): Promise<never> {
  await delay(timeoutMs, undefined, { ref: false, signal });
  throw new Error(`Backend drain exceeded ${timeoutMs}ms`);
}

export interface DrainParticipant {
  drain(): Promise<void>;
  name: string;
  order: number;
}

export const DRAIN_ORDER = {
  backgroundFinalize: 100,
  backgroundQuiesce: 25,
  database: 900,
  http: 50,
  sentry: 1000,
} as const;

@Injectable()
export class DrainCoordinatorService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(DrainCoordinatorService.name);
  private readonly participants: DrainParticipant[] = [
    {
      drain: async () => {
        await Sentry.flush(5000);
      },
      name: "sentry",
      order: DRAIN_ORDER.sentry,
    },
  ];
  private drainPromise: Promise<void> | undefined;

  constructor(
    @Inject(RuntimeReadinessService) private readonly readiness: RuntimeReadinessService,
    @Inject(BackendConfigService) private readonly config: BackendConfigService,
  ) {}

  beforeApplicationShutdown(signal?: string): Promise<void> {
    this.readiness.beginDrain();
    this.logger.log("Backend drain started", { signal });
    this.drainPromise ??= this.drainWithinTimeout();
    return this.drainPromise;
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
    const timeoutMs = this.config.get("SHUTDOWN_TIMEOUT_MS") ?? 120_000;
    const participants = this.participants.toSorted((left, right) => left.order - right.order);
    const pending = new Set(participants.map((participant) => participant.name));
    const drain = async () => {
      for (const participant of participants) {
        this.logger.log("Draining backend component", { component: participant.name });
        await participant.drain();
        pending.delete(participant.name);
      }
    };
    const timeoutController = new AbortController();
    try {
      await Promise.race([drain(), rejectAfterTimeout(timeoutMs, timeoutController.signal)]);
    } catch (error) {
      if (pending.size > 0) {
        const unfinished = [...pending].join(", ");
        this.logger.error("Backend drain did not finish", { unfinished });
        throw new Error(
          `${error instanceof Error ? error.message : "Backend drain failed"}; unfinished: ${unfinished}`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      timeoutController.abort();
    }
  }
}
