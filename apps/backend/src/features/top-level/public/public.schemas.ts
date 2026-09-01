import { z } from "zod";

export const invitationResponseSchema = z.object({
  action: z.enum(["accept", "decline"]),
  declineReason: z.string().trim().max(500).nullable().optional(),
});

export const publicRoundResolveQuerySchema = z.object({
  id: z.string().trim().min(1),
});

export const publicRoundResolveResponseSchema = z.object({ roundId: z.string() });

const nullableStringSchema = z.string().nullable();
const publicReportSchema = z.looseObject({
  conversationId: z.string().optional(),
  createdAt: z.string().optional(),
  status: z.string().optional(),
  transcriptSummary: z.string().nullable().optional(),
  turnCount: z.number().optional(),
});

export const publicReferralResponseSchema = z.object({
  companyName: z.string(),
  jobDescriptionCode: z.string(),
  jobDescriptionName: z.string(),
  referrerName: nullableStringSchema,
});

export const publicReferralUploadResponseSchema = z.object({
  batchId: z.string(),
  poolItemId: nullableStringSchema,
  status: z.literal("queued"),
});

export const publicAiInterviewInvitationResponseSchema = z.object({
  candidateName: z.string(),
  companyName: z.string(),
  expiresAt: z.string(),
  jobName: nullableStringSchema,
  roundName: z.string(),
  scheduledAt: nullableStringSchema,
  status: z.string(),
});

export const publicInvitationDecisionResponseSchema = z.looseObject({
  interviewUrl: nullableStringSchema.optional(),
  status: z.enum(["accepted", "declined"]),
});

export const publicHumanMeetingResponseSchema = z.looseObject({
  candidateName: z.string(),
  meetingId: z.string(),
  roundLabel: z.string(),
  scheduledAt: nullableStringSchema,
  status: z.string(),
  title: z.string(),
  validUntil: nullableStringSchema,
});

export const publicLiveKitTokenResponseSchema = z.object({
  participantRole: z.string(),
  participantToken: z.string(),
  roomName: z.string(),
  serverUrl: z.string(),
});

export const publicInterviewRoundResponseSchema = z.looseObject({
  candidate: z.looseObject({ id: z.string() }),
  hasReport: z.boolean(),
  id: z.string(),
  roundLabel: z.string(),
  status: z.string(),
});

export const publicInterviewRoundReportsResponseSchema = z.array(publicReportSchema);
export const publicInterviewRoundReportResponseSchema = publicReportSchema;

export const publicFormSubmissionsResponseSchema = z.object({
  submissions: z.array(
    z.looseObject({
      id: z.string(),
      templateId: z.string(),
    }),
  ),
});

export const publicRecordingResponseSchema = z.object({
  expiresInSeconds: z.number(),
  url: z.string(),
});

export const publicResumeResponseSchema = z.looseObject({
  candidateName: z.string(),
  id: z.string(),
  pipelineStage: z.string(),
  resumeFileName: nullableStringSchema,
  targetRole: nullableStringSchema,
});

export const publicResumeRoundsResponseSchema = z.array(
  z.looseObject({
    id: z.string(),
    roundLabel: z.string(),
    sortOrder: z.number(),
    status: z.string(),
  }),
);

export const publicCandidateMaterialsResponseSchema = z.array(
  z.object({
    candidateName: z.string(),
    id: z.string(),
    rounds: z.array(z.object({ id: z.string(), label: z.string() })),
    targetRole: z.string(),
  }),
);

export const publicCandidateMaterialResponseSchema = z.object({
  candidate: z.looseObject({
    candidateName: z.string(),
    hasResumeFile: z.boolean(),
    id: z.string(),
    targetRole: nullableStringSchema,
  }),
});

export const publicCandidateAiEvaluationResponseSchema = z.object({
  aiEvaluation: z.object({
    evaluation: z.json().nullable(),
    status: z.enum(["ready", "legacy", "pending", "failed", "missing"]),
  }),
});

export const publicCandidateHrInformationResponseSchema = z.object({
  hrInitialInformation: z
    .looseObject({
      conversationId: z.string(),
      generatedAt: z.string(),
      roundLabel: nullableStringSchema,
      values: z.json(),
    })
    .nullable(),
});

export const publicCandidateQuestionsResponseSchema = z.object({
  interviewQuestions: z.array(
    z.looseObject({
      id: z.string().optional(),
      question: z.string().optional(),
    }),
  ),
});
