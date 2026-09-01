import { z } from "zod";
import {
  candidateOutcomeSchema,
  closedMetaSchema,
  pipelineStageSchema,
  studioInterviewQuestionClientSchema,
} from "@arc/db-schema/studio-interviews";
import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";

export const chatWorkspacePathSchema = z.object({ slug: z.string().min(1) });
export const chatConversationPathSchema = chatWorkspacePathSchema.extend({
  id: z.string().min(1),
});
export const chatAttachmentPathSchema = chatWorkspacePathSchema.extend({
  id: z.string().min(1),
});

export const jobDescriptionConfigSchema = z.union([
  z.object({
    departmentName: z.string().nullable(),
    jobDescriptionId: z.string().min(1),
    mode: z.literal("select"),
    name: z.string().min(1),
    prompt: z.string(),
  }),
  z.object({ mode: z.literal("custom"), text: z.string() }),
]);

export const arcMessageSchema = z
  .object({
    createdAt: z.string().optional(),
    id: z.string().min(1),
    metadata: z.record(z.string(), z.json()).optional(),
    parts: z.array(z.record(z.string(), z.unknown())),
    role: z.enum(["system", "user", "assistant", "tool"]),
  })
  .loose();

export const legacyUiMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["system", "user", "assistant"]),
  })
  .loose();

export const upsertChatMessageSchema = z.object({ message: legacyUiMessageSchema });
export const upsertConversationSchema = z.object({
  createdAt: z.number().int().nonnegative().optional(),
  id: z.string().min(1),
  isTitleGenerating: z.boolean().optional(),
  jobDescription: z.string().optional(),
  jobDescriptionConfig: jobDescriptionConfigSchema.nullable().optional(),
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});
export const patchConversationSchema = upsertConversationSchema.omit({
  createdAt: true,
  id: true,
});

const recruitingActionBaseSchema = z.object({
  explanation: z.string().trim().min(1).max(600),
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
});

export const confirmRecruitingActionSchema = z.object({
  decision: z.enum(["confirm", "ignore"]).optional().default("confirm"),
  proposal: z.discriminatedUnion("type", [
    recruitingActionBaseSchema.extend({
      payload: z.object({
        jobDescriptionId: z.string().min(1).nullish(),
        resumeRecordId: z.string().min(1),
      }),
      type: z.literal("bind_candidate_to_job"),
    }),
    recruitingActionBaseSchema.extend({
      payload: z.object({
        jobDescriptionId: z.string().min(1).nullish(),
        poolItemId: z.string().min(1),
      }),
      type: z.literal("bind_pool_item_to_job"),
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
          (value) =>
            value.pipelineStage === "closed"
              ? value.outcome !== undefined && value.outcome !== "in_pipeline"
              : value.outcome === undefined || value.outcome === "in_pipeline",
          {
            message:
              "结束阶段必须指定一个终态 outcome（hired/rejected/withdrawn/archived）；非结束阶段 outcome 必须为 in_pipeline。",
            path: ["outcome"],
          },
        )
        .refine((value) => value.pipelineStage === "closed" || !value.closedReason, {
          message: "closedReason 仅在结束时允许。",
          path: ["closedReason"],
        })
        .refine((value) => value.pipelineStage === "closed" || !value.closedMeta, {
          message: "closedMeta 仅在结束时允许。",
          path: ["closedMeta"],
        })
        .refine((value) => value.pipelineStage !== "closed" || !value.reactivationReason, {
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
export const uploadPreflightSchema = z
  .object({
    filename: z.string().min(1).max(255),
    hash: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid sha256 hex"),
    mediaType: z.string().min(1).max(255),
    size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE),
  })
  .superRefine((input, context) => {
    if (isSupportedResumeDocumentInput({ fileName: input.filename, mediaType: input.mediaType })) {
      return;
    }
    context.addIssue({
      code: "custom",
      message: "Unsupported resume document type",
      path: ["mediaType"],
    });
  });

export const okSchema = z.object({ ok: z.literal(true) });
export const conversationSummarySchema = z.object({
  createdAt: z.string(),
  id: z.string(),
  isTitleGenerating: z.boolean(),
  title: z.string(),
  updatedAt: z.string(),
});
export const conversationListSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});
export const conversationDetailSchema = z.object({
  conversation: conversationSummarySchema.extend({
    jobDescription: z.string(),
    jobDescriptionConfig: jobDescriptionConfigSchema.nullable(),
    messages: z.array(z.json()),
    resumeImports: z.record(z.string(), z.string()),
  }),
});
export const recruitingActionResultSchema = z
  .object({
    actionType: z.string().optional(),
    confirmation: z
      .object({
        confirmedAt: z.string(),
        jobDescriptionId: z.string().optional(),
        jobDescriptionName: z.string().nullable().optional(),
        status: z.enum(["confirmed", "ignored"]),
      })
      .optional(),
    message: z.string(),
    status: z.enum(["executed", "failed", "noop"]),
  })
  .loose();
export const uploadResponseSchema = z.object({
  hit: z.boolean().optional(),
  id: z.string(),
  parseStatus: z.string(),
  parsed: z
    .object({
      pageCount: z.number().int(),
      structured: z.unknown().nullable(),
      text: z.string(),
      textSource: z.string(),
    })
    .optional(),
  url: z.string(),
});
export const jobMatchSchema = z
  .object({
    matchedId: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .loose();
