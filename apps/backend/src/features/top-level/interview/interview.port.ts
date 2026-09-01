import type { TopLevelResponse } from "../top-level.ports.js";
import type { z } from "zod";
import type {
  candidateInterviewFeedbackInputSchema,
  interviewFormSubmissionSchema,
} from "./interview.schemas.js";

export const TOP_LEVEL_INTERVIEW_PORT = Symbol("TOP_LEVEL_INTERVIEW_PORT");

export interface TopLevelInterviewPort {
  complete(input: {
    interviewId: string;
    mode: "interrupt" | "final";
    roundId: string;
  }): Promise<{ success: true }>;
  createLiveKitToken(input: { interviewId: string; roundId: string }): Promise<TopLevelResponse>;
  getForms(input: { interviewId: string; roundId: string }): Promise<TopLevelResponse>;
  getInterview(input: { interviewId: string; roundId: string }): Promise<TopLevelResponse>;
  resolve(input: { interviewId: string }): Promise<{ interviewId: string; roundId: string }>;
  submitFeedback(input: {
    feedback: z.infer<typeof candidateInterviewFeedbackInputSchema>;
    interviewId: string;
    roundId: string;
  }): Promise<TopLevelResponse>;
  submitForm(input: {
    body: z.infer<typeof interviewFormSubmissionSchema>;
    interviewId: string;
    roundId: string;
    templateId: string;
  }): Promise<TopLevelResponse>;
}
