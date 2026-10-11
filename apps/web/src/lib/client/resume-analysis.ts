import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { AnalysisStreamEvent } from "@app/shared/api-stream";
import { resumeReviewSchema } from "@app/shared/resume-review";
import type { ResumeReview } from "@app/shared/resume-review";
import { z } from "zod";
import { analysisStreamEventSchema, readAiRunEventStream } from "./ai-run-event-stream";
import { rpc } from "./rpc";

export interface GenerateResumeReviewOptions {
  jobDescriptionId?: string | null;
  onEvent?: (event: AnalysisStreamEvent) => void;
  onDraftChange?: (review: string) => void;
  resumeProfile: ResumeProfile;
  signal?: AbortSignal;
  workspaceSlug: string;
}

export interface GenerateResumeReviewResult {
  review: string;
  structuredReview: ResumeReview;
}

const errorResponseSchema = z.object({ error: z.string().optional() }).nullable();
const generateResumeReviewResultSchema = z.object({
  review: z.string(),
  structuredReview: resumeReviewSchema,
});

async function parseJsonResponse<const T>(response: Response, schema: z.ZodType<T>) {
  const raw = await response.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function generateResumeReviewMarkdownFirst({
  jobDescriptionId,
  onEvent,
  onDraftChange,
  resumeProfile,
  signal,
  workspaceSlug,
}: GenerateResumeReviewOptions): Promise<GenerateResumeReviewResult | null> {
  const response = await rpc.api.w[":slug"].interview["generate-review-markdown-stream"].$post(
    {
      json: { jobDescriptionId: jobDescriptionId || null, resumeProfile },
      param: { slug: workspaceSlug },
    },
    { init: { signal } },
  );

  if (!response.ok) {
    const errBody = await parseJsonResponse(response, errorResponseSchema);
    throw new Error(errBody?.error ?? "简历评价生成失败");
  }

  let draft = "";
  let result: GenerateResumeReviewResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream(
    response,
    analysisStreamEventSchema,
    (event) => {
      if (signal?.aborted) {
        return;
      }
      onEvent?.(event);
      if (event.type === "step.delta") {
        draft += event.text;
        onDraftChange?.(draft);
      }
      if (event.type === "run.completed") {
        const parsed = generateResumeReviewResultSchema.safeParse(event.output);
        if (parsed.success) {
          const { data } = parsed;
          result = { review: data.review, structuredReview: data.structuredReview };
          onDraftChange?.(result.review);
        }
      }
      if (event.type === "run.failed") {
        streamError = event.error.message;
      }
    },
    signal,
  );

  if (signal?.aborted) {
    return null;
  }
  if (streamError) {
    throw new Error(streamError);
  }

  return result ?? null;
}
