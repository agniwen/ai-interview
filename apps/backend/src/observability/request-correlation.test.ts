/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- Express and BullMQ test doubles intentionally implement only the middleware/processor seams exercised here; callbacks are the contracts under test. */
import * as Sentry from "@sentry/nestjs";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { ResumeSemanticIndexProcessor } from "../domains/candidate-lifecycle/workloads/bullmq/candidate-bullmq.processors.js";
import { CorrelatedConsoleLogger } from "./correlated-console.logger.js";
import {
  correlationIdFromJobOptions,
  getRequestCorrelationId,
  runWithRequestCorrelation,
  withCorrelationJobOptions,
} from "./request-correlation.context.js";
import { RequestCorrelationMiddleware } from "./request-correlation.middleware.js";

describe("request correlation", () => {
  it("keeps the request header, ALS context, and Sentry isolation scope aligned", () => {
    const headers = new Map<string, string>();
    const request = {
      header: vi.fn(() => "request-123"),
    };
    const response = {
      setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    };
    const next = vi.fn(() => {
      expect(getRequestCorrelationId()).toBe("request-123");
      const scope = Sentry.getIsolationScope().getScopeData();
      expect(scope.tags.correlation_id).toBe("request-123");
      expect(scope.contexts.request_correlation).toEqual({ correlationId: "request-123" });
    });

    new RequestCorrelationMiddleware().use(request as never, response as never, next);

    expect(headers.get("x-request-id")).toBe("request-123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("adds correlation ID to structured and text Nest logs", () => {
    const jsonLogger = new CorrelatedConsoleLogger({ forceConsole: true, json: true });
    const textLogger = new CorrelatedConsoleLogger({ forceConsole: true, json: false });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    runWithRequestCorrelation("request-log", () => {
      jsonLogger.log("structured", "CorrelationTest");
      textLogger.log("text", "CorrelationTest");
    });

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      correlationId: "request-log",
      message: "structured",
    });
    expect(log.mock.calls[1]?.[0]).toContain("correlationId=request-log");
    log.mockRestore();
  });

  it("stores correlation in supported BullMQ telemetry options without changing payload schemas", () => {
    const options = runWithRequestCorrelation("request-job", () =>
      withCorrelationJobOptions({ attempts: 3 }),
    );

    expect(options).toEqual({
      attempts: 3,
      telemetry: { metadata: JSON.stringify({ correlationId: "request-job" }) },
    });
    expect(correlationIdFromJobOptions(options)).toBe("request-job");
    expect(correlationIdFromJobOptions({ telemetry: { metadata: "not-json" } })).toBeUndefined();
  });

  it("restores correlation before a BullMQ processor calls its workload adapter", async () => {
    const adapter = {
      processResumeSemanticIndex: vi.fn(async () => {
        expect(getRequestCorrelationId()).toBe("request-worker");
        expect(Sentry.getIsolationScope().getScopeData().tags.correlation_id).toBe(
          "request-worker",
        );
      }),
    };
    const processor = new ResumeSemanticIndexProcessor(adapter as never);
    const job = {
      data: {
        organizationId: "org-1",
        sourceId: "resume-1",
        sourceType: "studio_interview",
      },
      opts: withCorrelationJobOptions({}, "request-worker"),
    };

    await processor.process(job as unknown as Job);

    expect(adapter.processResumeSemanticIndex).toHaveBeenCalledOnce();
  });
});
