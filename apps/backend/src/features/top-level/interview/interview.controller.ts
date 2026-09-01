import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  SerializeOptions,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { identifierSchema, successResponseSchema } from "../shared.schemas.js";
import { TOP_LEVEL_INTERVIEW_PORT } from "./interview.port.js";
import type { TopLevelInterviewPort } from "./interview.port.js";
import {
  candidateInterviewFeedbackResponseSchema,
  candidateInterviewFeedbackInputSchema,
  candidateInterviewFormSubmissionResponseSchema,
  candidateInterviewFormsResponseSchema,
  candidateInterviewLiveKitTokenResponseSchema,
  candidateInterviewResponseSchema,
  interviewCompleteQuerySchema,
  interviewFormSubmissionSchema,
} from "./interview.schemas.js";

const resolveResponseSchema = z.object({ interviewId: z.string(), roundId: z.string() });

@ApiTags("interview")
@Controller("api/interview")
export class InterviewController {
  constructor(
    @Inject(TOP_LEVEL_INTERVIEW_PORT)
    private readonly interviews: TopLevelInterviewPort,
  ) {}

  @Post(":id/:roundId/feedback")
  @HttpCode(200)
  @SerializeOptions({ schema: candidateInterviewFeedbackResponseSchema })
  @ApiOperation({ operationId: "submitCandidateInterviewFeedback" })
  @ApiResponse({ status: 200 })
  feedback(
    @Param("id", { schema: identifierSchema }) interviewId: string,
    @Param("roundId", { schema: identifierSchema }) roundId: string,
    @Body({ schema: candidateInterviewFeedbackInputSchema })
    feedback: z.infer<typeof candidateInterviewFeedbackInputSchema>,
  ) {
    return this.interviews.submitFeedback({ feedback, interviewId, roundId });
  }

  @Post(":id/:roundId/livekit-token")
  @HttpCode(200)
  @SerializeOptions({ schema: candidateInterviewLiveKitTokenResponseSchema })
  @ApiOperation({ operationId: "createCandidateInterviewLiveKitToken" })
  @ApiResponse({ status: 200 })
  liveKitToken(
    @Param("id", { schema: identifierSchema }) interviewId: string,
    @Param("roundId", { schema: identifierSchema }) roundId: string,
  ) {
    return this.interviews.createLiveKitToken({ interviewId, roundId });
  }

  @Get(":id/resolve")
  @SerializeOptions({ schema: resolveResponseSchema })
  @ApiOperation({ operationId: "resolveCandidateInterviewRound" })
  @ApiResponse({ status: 200 })
  resolve(@Param("id", { schema: identifierSchema }) interviewId: string) {
    return this.interviews.resolve({ interviewId });
  }

  @Get(":id/:roundId")
  @SerializeOptions({ schema: candidateInterviewResponseSchema })
  @ApiOperation({ operationId: "getCandidateInterview" })
  @ApiResponse({ status: 200 })
  getInterview(
    @Param("id", { schema: identifierSchema }) interviewId: string,
    @Param("roundId", { schema: identifierSchema }) roundId: string,
  ) {
    return this.interviews.getInterview({ interviewId, roundId });
  }

  @Get(":id/:roundId/forms")
  @SerializeOptions({ schema: candidateInterviewFormsResponseSchema })
  @ApiOperation({ operationId: "listCandidateInterviewForms" })
  @ApiResponse({ status: 200 })
  forms(
    @Param("id", { schema: identifierSchema }) interviewId: string,
    @Param("roundId", { schema: identifierSchema }) roundId: string,
  ) {
    return this.interviews.getForms({ interviewId, roundId });
  }

  @Post(":id/:roundId/forms/:templateId/submit")
  @HttpCode(200)
  @SerializeOptions({ schema: candidateInterviewFormSubmissionResponseSchema })
  @ApiOperation({ operationId: "submitCandidateInterviewForm" })
  @ApiResponse({ status: 200 })
  submitForm(
    @Param("id", { schema: identifierSchema }) interviewId: string,
    @Param("roundId", { schema: identifierSchema }) roundId: string,
    @Param("templateId", { schema: identifierSchema }) templateId: string,
    @Body({ schema: interviewFormSubmissionSchema })
    body: z.infer<typeof interviewFormSubmissionSchema>,
  ) {
    return this.interviews.submitForm({ body, interviewId, roundId, templateId });
  }

  @Post(":id/:roundId/complete")
  @HttpCode(200)
  @SerializeOptions({ schema: successResponseSchema })
  @ApiOperation({ operationId: "completeCandidateInterviewRound" })
  @ApiResponse({ status: 200 })
  complete(
    @Param("id", { schema: identifierSchema }) interviewId: string,
    @Param("roundId", { schema: identifierSchema }) roundId: string,
    @Query({ schema: interviewCompleteQuerySchema })
    query: z.infer<typeof interviewCompleteQuerySchema>,
  ) {
    return this.interviews.complete({
      interviewId,
      mode: query.mode === "final" ? "final" : "interrupt",
      roundId,
    });
  }
}
