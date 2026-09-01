import { Body, Controller, HttpCode, Inject, Post, Req, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { TOP_LEVEL_AUTH_PORT } from "../top-level.ports.js";
import type { TopLevelAuthPort } from "../top-level.ports.js";
import { TOP_LEVEL_AGENT_PORT } from "./agent.port.js";
import type { TopLevelAgentPort } from "./agent.port.js";
import {
  questionCheckpointPayloadSchema,
  reportPayloadSchema,
  retryNotificationPayloadSchema,
  retrySummariesResponseSchema,
} from "./agent.schemas.js";

const checkpointResponseSchema = z.object({ success: z.literal(true) });
const reportResponseSchema = checkpointResponseSchema.extend({ conversationId: z.string() });
const retryNotificationsResponseSchema = z.object({
  retried: z.number().int().nonnegative(),
  scoped: z.boolean().optional(),
});

@ApiTags("agent")
@Controller("api/agent")
export class AgentController {
  constructor(
    @Inject(TOP_LEVEL_AGENT_PORT)
    private readonly agent: TopLevelAgentPort,
    @Inject(TOP_LEVEL_AUTH_PORT)
    private readonly auth: TopLevelAuthPort,
  ) {}

  @Post("checkpoint")
  @HttpCode(201)
  @SerializeOptions({ schema: checkpointResponseSchema })
  @ApiOperation({ operationId: "recordAgentQuestionCheckpoint" })
  @ApiResponse({ status: 201 })
  async checkpoint(
    @Body({ schema: questionCheckpointPayloadSchema })
    body: z.infer<typeof questionCheckpointPayloadSchema>,
    @Req() request: Request,
  ) {
    this.auth.requireAgent(request);
    await this.agent.persistCheckpoint(body);
    return { success: true } as const;
  }

  @Post("report")
  @HttpCode(201)
  @SerializeOptions({ schema: reportResponseSchema })
  @ApiOperation({ operationId: "recordAgentInterviewReport" })
  @ApiResponse({ status: 201 })
  async report(
    @Body({ schema: reportPayloadSchema }) body: z.infer<typeof reportPayloadSchema>,
    @Req() request: Request,
  ) {
    this.auth.requireAgent(request);
    const result = await this.agent.persistReport(body);
    return { conversationId: result.conversationId, success: true } as const;
  }

  @Post("retry-summaries")
  @HttpCode(200)
  @SerializeOptions({ schema: retrySummariesResponseSchema })
  @ApiOperation({ operationId: "retryAgentInterviewSummaries" })
  @ApiResponse({ status: 200 })
  retrySummaries(@Req() request: Request) {
    this.auth.requireAgent(request);
    return this.agent.retrySummaries();
  }

  @Post("retry-notifications")
  @HttpCode(200)
  @SerializeOptions({ schema: retryNotificationsResponseSchema })
  @ApiOperation({ operationId: "retryAgentInterviewNotifications" })
  @ApiResponse({ status: 200 })
  retryNotifications(
    @Body({ schema: retryNotificationPayloadSchema })
    body: z.infer<typeof retryNotificationPayloadSchema>,
    @Req() request: Request,
  ) {
    this.auth.requireAgent(request);
    return this.agent.retryNotifications(body);
  }
}
