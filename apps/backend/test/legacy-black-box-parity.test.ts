/* oxlint-disable no-inline-comments -- Vite requires its dynamic-import escape hatch as an inline magic comment for test-only legacy modules. */
import "reflect-metadata";

import {
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { HttpAdapterHost, NestFactory, Reflector } from "@nestjs/core";
import { TerminusModule } from "@nestjs/terminus";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HTTP_REQUEST_AUTH } from "../src/infrastructure/http/http.ports.js";
import type { HttpRequestAuth } from "../src/infrastructure/http/http.ports.js";
import { JoinController } from "../src/domains/identity-access/join/join.controller.js";
import { JOIN_PORT } from "../src/domains/identity-access/join/join.port.js";
import type { JoinPort } from "../src/domains/identity-access/join/join.port.js";
import {
  BackgroundDiagnosticsController,
  WorkerDiagnosticsGuard,
} from "../src/background/background.controller.js";
import { BackgroundDiagnosticsService } from "../src/background/background.diagnostics.js";
import { BackendConfigService } from "../src/config/backend-config.service.js";
import { BackgroundReadinessHealthIndicator } from "../src/health/background-readiness-health.indicator.js";
import { DatabaseHealthIndicator } from "../src/health/database-health.indicator.js";
import { HealthController } from "../src/health/health.controller.js";
import { RuntimeReadinessHealthIndicator } from "../src/health/runtime-readiness-health.indicator.js";
import { API_DATABASE_CONNECTION } from "../src/infrastructure/database/database.tokens.js";
import { MachineReadableHttpExceptionFilter } from "../src/infrastructure/http/machine-readable-http-exception.filter.js";
import { RuntimeReadinessService } from "../src/runtime/runtime-readiness.service.js";

interface LegacyHonoApp {
  request(input: RequestInfo | URL, requestInit?: RequestInit): Promise<Response>;
}

interface LegacyWorkerDependencies {
  getInterviewNotificationSchedulerSnapshot(): object;
  getMeetingIntelligenceQueueStats(): Promise<object>;
  getMeetingOperationsSnapshot(): Promise<object>;
  getMeetingPlaybackQueueStats(): Promise<object>;
  getMeetingTranscriptionQueueStats(): Promise<object>;
  getResumeParseQueueStats(): Promise<object>;
  getResumeParseReadinessIssue(): string | null;
  getResumeReviewGenerationQueueStats(): Promise<object>;
  isResumeParseQueueConfigured(): boolean;
  pingDatabase(): Promise<void>;
}

interface LegacyWorkerModule {
  createWorkerApp(dependencies: LegacyWorkerDependencies): LegacyHonoApp;
}

interface LegacyJoinModule {
  joinRouter: LegacyHonoApp;
}

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/parity_test";
const workerModulePath = new URL("../../worker/src/app.ts", import.meta.url).href;
const joinModulePath = new URL("../../server/src/server/routes/join/route.ts", import.meta.url)
  .href;
// SAFETY: These test-only modules are checked against the minimal HTTP adapter contracts below.
const { createWorkerApp } = (await import(
  /* @vite-ignore */ workerModulePath
)) as LegacyWorkerModule;
// SAFETY: The frozen legacy join module exports a Hono router with the standard request method.
const { joinRouter } = (await import(/* @vite-ignore */ joinModulePath)) as LegacyJoinModule;

const queueStats = {
  active: 1,
  completed: 2,
  delayed: 3,
  failed: 4,
  paused: 5,
  waiting: 6,
};

const legacyWorker = createWorkerApp({
  getInterviewNotificationSchedulerSnapshot: () => ({
    claimed: 0,
    enabled: true,
    lastErrorAt: null,
    lastRunAt: null,
    lastSuccessAt: null,
    running: false,
  }),
  getMeetingIntelligenceQueueStats: vi.fn(),
  getMeetingOperationsSnapshot: vi.fn(),
  getMeetingPlaybackQueueStats: vi.fn(),
  getMeetingTranscriptionQueueStats: vi.fn(),
  getResumeParseQueueStats: vi.fn(async () => queueStats),
  getResumeParseReadinessIssue: () => null,
  getResumeReviewGenerationQueueStats: vi.fn(async () => queueStats),
  isResumeParseQueueConfigured: () => true,
  pingDatabase: vi.fn(async () => {}),
});

const authPort: HttpRequestAuth = {
  actor: () => null,
  requireActor: () => {
    throw new Error("The invalid-code parity case must fail before authentication.");
  },
  requireAgent: () => {},
  requirePlatformAdministrator: () => ({ id: "platform-admin" }),
};

const joinPort: JoinPort = {
  accept: vi.fn(),
  preview: vi.fn(),
};

@Module({
  controllers: [BackgroundDiagnosticsController, HealthController, JoinController],
  imports: [TerminusModule],
  providers: [
    BackgroundReadinessHealthIndicator,
    DatabaseHealthIndicator,
    RuntimeReadinessHealthIndicator,
    WorkerDiagnosticsGuard,
    { provide: API_DATABASE_CONNECTION, useValue: { ping: vi.fn(async () => {}) } },
    {
      provide: BackendConfigService,
      useValue: {
        get(name: string) {
          if (name === "WORKER_DIAGNOSTICS_SECRET") {
            return "parity-secret";
          }
          return name === "BACKGROUND_WORKERS_ENABLED";
        },
      },
    },
    {
      provide: BackgroundDiagnosticsService,
      useValue: {
        getInterviewNotificationSnapshot: vi.fn(),
        getMeetingOperationsSnapshot: vi.fn(),
        getReadinessIssue: vi.fn(async () => null),
        getResumeParseQueueStats: vi.fn(async () => queueStats),
        getResumeReviewGenerationQueueStats: vi.fn(async () => queueStats),
      },
    },
    { provide: RuntimeReadinessService, useValue: { isDraining: () => false } },
    { provide: HTTP_REQUEST_AUTH, useValue: authPort },
    { provide: JOIN_PORT, useValue: joinPort },
  ],
})
class BlackBoxParityModule {}

describe("representative legacy-to-Nest black-box parity", () => {
  let nestApplication: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeAll(async () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "true";
    process.env.READINESS_DATABASE_CHECK_ENABLED = "false";
    process.env.WORKER_DIAGNOSTICS_SECRET = "parity-secret";
    nestApplication = await NestFactory.create(BlackBoxParityModule, { logger: false });
    nestApplication.useGlobalFilters(
      new MachineReadableHttpExceptionFilter(nestApplication.get(HttpAdapterHost)),
    );
    nestApplication.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
    nestApplication.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(nestApplication.get(Reflector)),
    );
    await nestApplication.init();
  });

  afterAll(async () => {
    await nestApplication.close();
    delete process.env.WORKER_DIAGNOSTICS_SECRET;
  });

  it("preserves public health and successful readiness responses", async () => {
    const legacyHealth = await legacyWorker.request("/healthz");
    const nestHealth = await supertest(nestApplication.getHttpServer()).get("/healthz");
    expect(nestHealth.status).toBe(legacyHealth.status);
    expect(nestHealth.body).toEqual(await legacyHealth.json());

    const legacyReadiness = await legacyWorker.request("/readyz");
    const nestReadiness = await supertest(nestApplication.getHttpServer()).get("/readyz");
    expect(nestReadiness.status).toBe(legacyReadiness.status);
    expect(nestReadiness.body).toEqual(await legacyReadiness.json());
  });

  it("preserves worker diagnostic authentication and successful payloads", async () => {
    const legacyUnauthorized = await legacyWorker.request("/queues/resume-parse/stats");
    const nestUnauthorized = await supertest(nestApplication.getHttpServer()).get(
      "/queues/resume-parse/stats",
    );
    expect(nestUnauthorized.status).toBe(legacyUnauthorized.status);
    expect(nestUnauthorized.body).toMatchObject({ error: "Unauthorized", statusCode: 401 });

    const headers = { Authorization: "Bearer parity-secret" };
    const legacyAuthorized = await legacyWorker.request("/queues/resume-parse/stats", { headers });
    const nestAuthorized = await supertest(nestApplication.getHttpServer())
      .get("/queues/resume-parse/stats")
      .set(headers);
    expect(nestAuthorized.status).toBe(legacyAuthorized.status);
    expect(nestAuthorized.body).toEqual(await legacyAuthorized.json());
  });

  it("preserves Hono request rejection while using the intentional Nest error envelope", async () => {
    const legacyResponse = await joinRouter.request("http://localhost/not-valid/preview");
    const nestResponse = await supertest(nestApplication.getHttpServer()).get(
      "/api/join/not-valid/preview",
    );

    expect(nestResponse.status).toBe(legacyResponse.status);
    expect(legacyResponse.headers.get("content-type")).toContain("application/json");
    expect(nestResponse.headers["content-type"]).toContain("application/json");
    expect(nestResponse.body).toMatchObject({ error: "Bad Request", statusCode: 400 });
    expect(joinPort.preview).not.toHaveBeenCalled();
  });
});
