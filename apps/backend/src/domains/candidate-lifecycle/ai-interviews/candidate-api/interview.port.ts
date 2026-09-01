import type { HttpResponse } from "../../../../infrastructure/http/http.ports.js";
import type { z } from "zod";
import type {
  candidateInterviewFeedbackInputSchema,
  interviewFormSubmissionSchema,
} from "./interview.schemas.js";

export const CANDIDATE_INTERVIEW_PORT = Symbol("CANDIDATE_INTERVIEW_PORT");

export interface CandidateInterviewPort {
  complete(input: {
    interviewId: string;
    mode: "interrupt" | "final";
    roundId: string;
  }): Promise<{ success: true }>;
  createLiveKitToken(input: { interviewId: string; roundId: string }): Promise<HttpResponse>;
  getForms(input: { interviewId: string; roundId: string }): Promise<HttpResponse>;
  getInterview(input: { interviewId: string; roundId: string }): Promise<HttpResponse>;
  resolve(input: { interviewId: string }): Promise<{ interviewId: string; roundId: string }>;
  submitFeedback(input: {
    feedback: z.infer<typeof candidateInterviewFeedbackInputSchema>;
    interviewId: string;
    roundId: string;
  }): Promise<HttpResponse>;
  submitForm(input: {
    body: z.infer<typeof interviewFormSubmissionSchema>;
    interviewId: string;
    roundId: string;
    templateId: string;
  }): Promise<HttpResponse>;
}
