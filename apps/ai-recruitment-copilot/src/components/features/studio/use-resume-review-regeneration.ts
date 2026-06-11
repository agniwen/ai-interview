"use client";

import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { generateResumeReview } from "@/lib/client/resume-analysis";

interface RegenerateResumeReviewInput {
  jobDescriptionId?: string | null;
  resumeProfile: ResumeProfile;
}

interface UseResumeReviewRegenerationOptions {
  onDraftChange: (review: string) => void;
  onGenerated: (review: string) => void;
}

function isAbortError(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function useResumeReviewRegeneration({
  onDraftChange,
  onGenerated,
}: UseResumeReviewRegenerationOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const regenerate = useCallback(
    async ({ jobDescriptionId, resumeProfile }: RegenerateResumeReviewInput) => {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setIsGenerating(true);

      try {
        const review = await generateResumeReview({
          jobDescriptionId,
          onDraftChange: (draft) => {
            if (!abortController.signal.aborted) {
              onDraftChange(draft);
            }
          },
          resumeProfile,
          signal: abortController.signal,
        });

        if (review && !abortController.signal.aborted) {
          onGenerated(review);
          toast.success("已重新生成简历评价");
        }
      } catch (error) {
        if (!isAbortError(error, abortController.signal)) {
          toast.error(error instanceof Error ? error.message : "简历评价生成失败");
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
          setIsGenerating(false);
        }
      }
    },
    [onDraftChange, onGenerated],
  );

  useEffect(() => cancel, [cancel]);

  return { cancel, isGenerating, regenerate };
}
