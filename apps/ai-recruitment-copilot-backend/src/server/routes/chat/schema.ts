import { z } from "zod";
import {
  candidateOutcomeSchema,
  closedMetaSchema,
  pipelineStageSchema,
  studioInterviewQuestionClientSchema,
} from "@arc/db-schema/studio-interviews";
import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";

export const jobDescriptionConfigSchema = z.union([
  z.object({
    departmentName: z.string().nullable(),
    jobDescriptionId: z.string().min(1),
    mode: z.literal("select"),
    name: z.string().min(1),
    prompt: z.string(),
  }),
  z.object({
    mode: z.literal("custom"),
    text: z.string(),
  }),
]);

export const upsertChatMessageSchema = z.object({
  message: z
    .object({
      id: z.string().min(1),
      role: z.enum(["system", "user", "assistant"]),
    })
    .loose(),
});

export const upsertConversationSchema = z.object({
  createdAt: z.number().int().nonnegative().optional(),
  id: z.string().min(1),
  isTitleGenerating: z.boolean().optional(),
  jobDescription: z.string().optional(),
  jobDescriptionConfig: jobDescriptionConfigSchema.nullable().optional(),
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});

export const patchConversationSchema = z.object({
  isTitleGenerating: z.boolean().optional(),
  jobDescription: z.string().optional(),
  jobDescriptionConfig: jobDescriptionConfigSchema.nullable().optional(),
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});

const recruitingActionBaseSchema = z.object({
  explanation: z.string().trim().min(1).max(600),
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
});

export const confirmRecruitingActionSchema = z.object({
  proposal: z.discriminatedUnion("type", [
    recruitingActionBaseSchema.extend({
      payload: z.object({
        jobDescriptionId: z.string().min(1).nullable(),
        resumeRecordId: z.string().min(1),
      }),
      type: z.literal("bind_candidate_to_job"),
    }),
    recruitingActionBaseSchema.extend({
      payload: z
        .object({
          closedMeta: closedMetaSchema.omit({ previousStage: true }).partial().optional(),
          closedReason: z.string().trim().max(500).optional().nullable(),
          outcome: candidateOutcomeSchema.optional(),
          pipelineStage: pipelineStageSchema,
          reactivationReason: z.string().trim().max(500).optional(),
          resumeRecordId: z.string().min(1),
        })
        .refine(
          (v) => {
            if (v.pipelineStage === "closed") {
              return v.outcome !== undefined && v.outcome !== "in_pipeline";
            }
            return v.outcome === undefined || v.outcome === "in_pipeline";
          },
          {
            message:
              "结案阶段必须指定一个终态 outcome（hired/rejected/withdrawn/archived）；非结案阶段 outcome 必须为 in_pipeline。",
            path: ["outcome"],
          },
        )
        .refine((v) => v.pipelineStage === "closed" || !v.closedReason, {
          message: "closedReason 仅在结案时允许。",
          path: ["closedReason"],
        })
        .refine((v) => v.pipelineStage === "closed" || !v.closedMeta, {
          message: "closedMeta 仅在结案时允许。",
          path: ["closedMeta"],
        })
        .refine((v) => v.pipelineStage !== "closed" || !v.reactivationReason, {
          message: "reactivationReason 仅在重新激活时允许。",
          path: ["reactivationReason"],
        }),
      type: z.literal("advance_candidate_stage"),
    }),
    recruitingActionBaseSchema.extend({
      payload: z.object({
        interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50).optional(),
        resumeRecordId: z.string().min(1),
      }),
      type: z.literal("generate_interview_questions"),
    }),
  ]),
});

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

const HASH_RE = /^[0-9a-f]{64}$/;

export const uploadPreflightSchema = z
  .object({
    filename: z.string().min(1).max(255),
    hash: z.string().regex(HASH_RE, "Invalid sha256 hex"),
    mediaType: z.string().min(1).max(255),
    size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE),
  })
  .superRefine((input, ctx) => {
    if (isSupportedResumeDocumentInput({ fileName: input.filename, mediaType: input.mediaType })) {
      return;
    }
    ctx.addIssue({
      code: "custom",
      message: "Unsupported resume document type",
      path: ["mediaType"],
    });
  });
