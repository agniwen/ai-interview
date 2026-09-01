import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { z } from "zod";
import { sendHttpBinaryResponse } from "../../../infrastructure/http/binary-response.js";
import { InterviewerService } from "./interviewer.service.js";
import { interviewerPublicVoicePreviewPathSchema } from "./interviewer.schemas.js";

const binarySchema = { format: "binary", type: "string" } as const;
const audioResponseContent = {
  "application/octet-stream": { schema: binarySchema },
  "audio/mpeg": { schema: binarySchema },
  "audio/wav": { schema: binarySchema },
};
type VoicePreviewPath = z.infer<typeof interviewerPublicVoicePreviewPathSchema>;

@ApiTags("public-interviewer-voice-previews")
@Controller("public/minimax-voice-previews")
export class PublicInterviewerVoicePreviewController {
  constructor(@Inject(InterviewerService) private readonly interviewers: InterviewerService) {}

  @Get(":id")
  @ApiProduces("audio/mpeg", "audio/wav", "application/octet-stream")
  @ApiOperation({ operationId: "getPublicMinimaxVoicePreview" })
  @ApiResponse({ content: audioResponseContent, status: 200 })
  async get(
    @Param({ schema: interviewerPublicVoicePreviewPathSchema }) path: VoicePreviewPath,
    @Res() response: Response,
  ) {
    sendHttpBinaryResponse(response, await this.interviewers.publicVoicePreview(path.id));
  }
}
