import { z } from "zod";

export const candidateInterviewFeedbackInputSchema = z.object({
  categories: z
    .array(
      z.enum([
        "audio",
        "video",
        "network",
        "ai_conversation",
        "question_content",
        "page_operation",
        "other",
      ]),
    )
    .min(1, "请至少选择一个问题分类。")
    .max(7)
    .refine((categories) => new Set(categories).size === categories.length, "问题分类不能重复。"),
  detail: z
    .string()
    .trim()
    .min(10, "请至少填写 10 个字的问题描述。")
    .max(2000, "问题描述不能超过 2000 个字。"),
});

export const interviewFormSubmissionSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  versionId: z.string().min(1),
});

export const interviewCompleteQuerySchema = z.object({
  mode: z.enum(["interrupt", "final"]).optional(),
});
