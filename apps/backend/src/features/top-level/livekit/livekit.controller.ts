import { Controller, HttpCode, Inject, Post, Req, SerializeOptions } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { TOP_LEVEL_LIVEKIT_PORT } from "./livekit.port.js";
import type { TopLevelLiveKitPort } from "./livekit.port.js";

const liveKitWebhookResponseSchema = z.union([
  z.object({ handled: z.literal("human-interview"), ok: z.literal(true) }),
  z.object({ ignored: z.string(), ok: z.literal(true) }),
  z.object({ matched: z.number().int().nonnegative(), ok: z.literal(true) }),
]);

@ApiTags("livekit")
@Controller("api/livekit")
export class LiveKitController {
  constructor(
    @Inject(TOP_LEVEL_LIVEKIT_PORT)
    private readonly liveKit: TopLevelLiveKitPort,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  @SerializeOptions({ schema: liveKitWebhookResponseSchema })
  @ApiOperation({ operationId: "receiveLiveKitWebhook" })
  @ApiResponse({ status: 200 })
  webhook(@Req() request: Request) {
    return this.liveKit.handleWebhook(request);
  }
}
