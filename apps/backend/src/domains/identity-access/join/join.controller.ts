import {
  Controller,
  Get,
  GoneException,
  Inject,
  Param,
  Post,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { HTTP_REQUEST_AUTH } from "../../../infrastructure/http/http.ports.js";
import type { HttpRequestAuth } from "../../../infrastructure/http/http.ports.js";
import { InvalidJoinLinkError, JOIN_PORT } from "./join.port.js";
import type { JoinPort } from "./join.port.js";
import {
  joinAcceptResponseSchema,
  joinCodeSchema,
  joinPreviewResponseSchema,
} from "./join.schemas.js";

@ApiTags("join")
@Controller("api/join")
export class JoinController {
  constructor(
    @Inject(JOIN_PORT)
    private readonly joins: JoinPort,
    @Inject(HTTP_REQUEST_AUTH)
    private readonly auth: HttpRequestAuth,
  ) {}

  @Get(":code/preview")
  @SerializeOptions({ schema: joinPreviewResponseSchema })
  @ApiOperation({ operationId: "previewWorkspaceInviteLink" })
  @ApiResponse({ status: 200 })
  preview(@Param("code", { schema: joinCodeSchema }) code: string, @Req() request: Request) {
    return this.joins.preview({ code, userId: this.auth.actor(request)?.id ?? null });
  }

  @Post(":code/accept")
  @SerializeOptions({ schema: joinAcceptResponseSchema })
  @ApiOperation({ operationId: "acceptWorkspaceInviteLink" })
  @ApiResponse({ status: 200 })
  async accept(@Param("code", { schema: joinCodeSchema }) code: string, @Req() request: Request) {
    const actor = this.auth.requireActor(request);
    try {
      return await this.joins.accept({ code, userId: actor.id });
    } catch (error) {
      if (error instanceof InvalidJoinLinkError) {
        throw new GoneException("邀请链接已失效或不存在。", {
          errorCode: "WORKSPACE_INVITE_LINK_INVALID",
        });
      }
      throw error;
    }
  }
}
