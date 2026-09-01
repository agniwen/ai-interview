/* oxlint-disable max-classes-per-file -- The Nest graph test uses inert database/config doubles and local declarative modules. */
import { Global, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { afterEach, describe, expect, it } from "vitest";
import { BackgroundModule } from "../background/background.module.js";
import { BackgroundQueueProducerService } from "../background/background-queue-producer.service.js";
import type { BackgroundWorkloadAdapter } from "../background/background.types.js";
import { MIGRATED_BACKGROUND_WORKLOAD_ADAPTER } from "../background-workloads/background-workload.infrastructure.module.js";
import { BackendConfigService } from "../config/backend-config.service.js";
import {
  BACKGROUND_DATABASE,
  BACKGROUND_DATABASE_CONNECTION,
} from "../infrastructure/database/database.tokens.js";
import { RuntimeModule } from "../runtime/runtime.module.js";
import { BackgroundInfrastructureModule } from "./background-infrastructure.module.js";

const originalEnabled = process.env.BACKGROUND_WORKERS_ENABLED;
const originalRedisUrl = process.env.REDIS_URL;

const config = {
  get(name: string) {
    if (name === "BACKGROUND_WORKERS_ENABLED") {
      return false;
    }
    if (name === "REDIS_URL") {
      return "redis://127.0.0.1:6379/15";
    }
  },
};

@Global()
@Module({
  exports: [BACKGROUND_DATABASE, BACKGROUND_DATABASE_CONNECTION, BackendConfigService],
  providers: [
    { provide: BACKGROUND_DATABASE, useValue: {} },
    { provide: BACKGROUND_DATABASE_CONNECTION, useValue: {} },
    { provide: BackendConfigService, useValue: config },
  ],
})
class InfrastructureTestDependenciesModule {}

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.BACKGROUND_WORKERS_ENABLED;
  } else {
    process.env.BACKGROUND_WORKERS_ENABLED = originalEnabled;
  }
  if (originalRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = originalRedisUrl;
  }
});

describe("BackgroundInfrastructureModule queue producer graph", () => {
  it("initializes with real Nest queue providers on an HTTP-only replica", async () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/15";

    @Module({
      imports: [
        InfrastructureTestDependenciesModule,
        RuntimeModule,
        ScheduleModule.forRoot(),
        BackgroundModule.registerAsync({
          imports: [BackgroundInfrastructureModule],
          inject: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER],
          useFactory(adapter: BackgroundWorkloadAdapter) {
            return adapter;
          },
        }),
      ],
    })
    class InfrastructureApplicationModule {}

    const application = await NestFactory.createApplicationContext(
      InfrastructureApplicationModule,
      { logger: false },
    );
    expect(application.get(BackgroundQueueProducerService)).toBeInstanceOf(
      BackgroundQueueProducerService,
    );
    await application.close();
  });
});
