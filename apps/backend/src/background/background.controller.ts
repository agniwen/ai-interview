/* oxlint-disable max-classes-per-file -- The route-local stateless guard and controller form one diagnostics boundary; Nest DI requires constructor metadata. */
import { timingSafeEqual } from "node:crypto";
import {
  Controller,
  Get,
  Inject,
  Injectable,
  SerializeOptions,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { BackendConfigService } from "../config/backend-config.service.js";
import { BackgroundDiagnosticsService } from "./background.diagnostics.js";

const queueCountsSchema = z.object({
  active: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  delayed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  paused: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
});

const notificationSnapshotSchema = z.object({
  claimed: z.number().int().nonnegative(),
  enabled: z.boolean(),
  lastErrorAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  running: z.boolean(),
});

const meetingQueueStatsSchema = z.object({
  active: z.number().int().nonnegative(),
  concurrency: z.number().int().positive(),
  delayed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
});

const meetingOperationsSchema = z.object({
  alerts: z.array(z.unknown()),
  capacity: z.unknown(),
  generatedAt: z.string(),
  latency: z.unknown(),
  providerFailures: z.array(z.unknown()),
  purgeOutcomes: z.array(z.unknown()),
  queueRetries: z.array(z.unknown()),
  queues: z.object({
    finalTranscription: meetingQueueStatsSchema,
    intelligence: meetingQueueStatsSchema,
    mediaFinalization: meetingQueueStatsSchema,
  }),
});

function secureTokenMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

@Injectable()
export class WorkerDiagnosticsGuard implements CanActivate {
  constructor(@Inject(BackendConfigService) private readonly config: BackendConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get("WORKER_DIAGNOSTICS_SECRET")?.trim();
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!expected || !token || !secureTokenMatches(token, expected)) {
      throw new UnauthorizedException("Invalid worker diagnostics credentials", {
        errorCode: "WORKER_DIAGNOSTICS_UNAUTHORIZED",
      });
    }
    return true;
  }
}

@ApiBearerAuth()
@ApiTags("worker-diagnostics")
@Controller("system/background")
@UseGuards(WorkerDiagnosticsGuard)
export class BackgroundDiagnosticsController {
  constructor(
    @Inject(BackgroundDiagnosticsService)
    private readonly diagnostics: BackgroundDiagnosticsService,
  ) {}

  @Get("queues/resume-parse/stats")
  @ApiOperation({ operationId: "getResumeParseQueueStats" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: queueCountsSchema })
  async getResumeParseQueueStats() {
    return await this.diagnostics.getResumeParseQueueStats();
  }

  @Get("queues/resume-review-generation/stats")
  @ApiOperation({ operationId: "getResumeReviewGenerationQueueStats" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: queueCountsSchema })
  async getResumeReviewGenerationQueueStats() {
    return await this.diagnostics.getResumeReviewGenerationQueueStats();
  }

  @Get("operations/meetings")
  @ApiOperation({ operationId: "getMeetingWorkerOperations" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingOperationsSchema })
  async getMeetingOperations() {
    return await this.diagnostics.getMeetingOperationsSnapshot();
  }

  @Get("operations/interview-notifications")
  @ApiOperation({ operationId: "getInterviewNotificationWorkerOperations" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: notificationSnapshotSchema })
  getInterviewNotificationOperations() {
    return this.diagnostics.getInterviewNotificationSnapshot();
  }
}
