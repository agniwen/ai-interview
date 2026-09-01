import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { HTTP_REQUEST_AUTH } from "../../../infrastructure/http/http.ports.js";
import type { HttpRequestAuth } from "../../../infrastructure/http/http.ports.js";
import { MEETING_LOCAL_RECOVERY_PORT } from "./meeting-local-recovery.port.js";
import type { MeetingLocalRecoveryPort } from "./meeting-local-recovery.port.js";

const identifierSchema = z.string().trim().min(1);
const manifestSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const recoveryCheckSchema = z.object({ manifestSha256: manifestSha256Schema });
const recoveryCleanupSchema = z.object({
  manifestSha256: manifestSha256Schema,
  status: z.enum(["deleted", "failed"]),
});
const recoveryResponseSchema = z.object({ deleteRequired: z.boolean() });

@ApiTags("meeting-local-recovery")
@Controller("system/recovery/meetings")
export class MeetingLocalRecoveryController {
  constructor(
    @Inject(MEETING_LOCAL_RECOVERY_PORT)
    private readonly recovery: MeetingLocalRecoveryPort,
    @Inject(HTTP_REQUEST_AUTH)
    private readonly auth: HttpRequestAuth,
  ) {}

  @Post(":id")
  @HttpCode(200)
  @SerializeOptions({ schema: recoveryResponseSchema })
  @ApiOperation({ operationId: "checkMeetingLocalRecovery" })
  @ApiResponse({ status: 200 })
  async check(
    @Param("id", { schema: identifierSchema }) meetingId: string,
    @Body({ schema: recoveryCheckSchema }) body: z.infer<typeof recoveryCheckSchema>,
    @Req() request: Request,
  ) {
    const actor = this.auth.requireActor(request);
    const directive = await this.recovery.check({
      actorId: actor.id,
      manifestSha256: body.manifestSha256,
      meetingId,
    });
    return { deleteRequired: directive === "delete" };
  }

  @Put(":id")
  @HttpCode(204)
  @ApiOperation({ operationId: "recordMeetingLocalRecoveryCleanup" })
  @ApiResponse({ status: 204 })
  async cleanup(
    @Param("id", { schema: identifierSchema }) meetingId: string,
    @Body({ schema: recoveryCleanupSchema }) body: z.infer<typeof recoveryCleanupSchema>,
    @Req() request: Request,
  ): Promise<void> {
    const actor = this.auth.requireActor(request);
    await this.recovery.recordCleanup({
      actorId: actor.id,
      manifestSha256: body.manifestSha256,
      meetingId,
      status: body.status,
    });
  }
}
