"use client";

import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { GenerateResumeReviewResult } from "@/lib/client/resume-analysis";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { generateResumeReviewMarkdownFirst } from "@/lib/client/resume-analysis";
import { runAsyncAction } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface RegenerateResumeReviewInput {
  jobDescriptionId?: string | null;
  resumeProfile: ResumeProfile;
}

interface UseResumeReviewRegenerationOptions {
  onDraftChange: (review: string) => void;
  onGenerated: (result: GenerateResumeReviewResult) => void;
}

interface ResumeReviewRegenerationDependencies {
  generateResumeReviewMarkdownFirst: typeof generateResumeReviewMarkdownFirst;
  toast: Pick<typeof toast, "error" | "success">;
}

const defaultResumeReviewRegenerationDependencies: ResumeReviewRegenerationDependencies = {
  generateResumeReviewMarkdownFirst,
  toast,
};

function isAbortError(error: Error, signal: AbortSignal): boolean {
  return signal.aborted || error.name === "AbortError";
}

export function useResumeReviewRegeneration(
  { onDraftChange, onGenerated }: UseResumeReviewRegenerationOptions,
  dependencies: ResumeReviewRegenerationDependencies = defaultResumeReviewRegenerationDependencies,
) {
  const workspaceSlug = useWorkspaceSlug();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [progressTools, setProgressTools] = useState<{ done: boolean; name: string }[]>([]);
  const [scoringPreview, setScoringPreview] = useState<unknown>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stepLabelsRef = useRef<Record<string, string>>({});

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const resetProgress = useCallback(() => {
    setProgressStatus("");
    setProgressTools([]);
    setScoringPreview(null);
    stepLabelsRef.current = {};
  }, []);

  const handleEvent = useCallback((event: AnalysisStreamEvent, signal: AbortSignal) => {
    if (signal.aborted) {
      return;
    }
    if (event.type === "run.started") {
      setProgressStatus(event.title);
      return;
    }
    if (event.type === "step.started") {
      stepLabelsRef.current = { ...stepLabelsRef.current, [event.stepId]: event.label };
      setProgressStatus(event.label);
      setProgressTools((prev) =>
        prev.some((tool) => tool.name === event.label)
          ? prev
          : [...prev, { done: false, name: event.label }],
      );
      return;
    }
    if (event.type === "step.progress" && event.label) {
      setProgressStatus(event.label);
      return;
    }
    if (event.type === "step.preview" && event.artifactType === "resume.review.scoring") {
      setScoringPreview(event.data);
      return;
    }
    if (event.type === "step.completed") {
      const name = stepLabelsRef.current[event.stepId] ?? event.stepId;
      setProgressTools((prev) =>
        prev.some((tool) => tool.name === name)
          ? prev.map((tool) => (tool.name === name ? { ...tool, done: true } : tool))
          : [...prev, { done: true, name }],
      );
      return;
    }
    if (event.type === "run.failed") {
      setProgressStatus(event.error.message);
    }
  }, []);

  const regenerate = useCallback(
    async ({ jobDescriptionId, resumeProfile }: RegenerateResumeReviewInput) => {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      resetProgress();
      setIsGenerating(true);

      await runAsyncAction({
        cleanup: () => {
          if (abortControllerRef.current === abortController) {
            abortControllerRef.current = null;
            setIsGenerating(false);
            setProgressStatus("");
          }
        },
        onError: (error) => {
          if (!isAbortError(error, abortController.signal)) {
            dependencies.toast.error(error.message);
          }
        },
        operation: async () => {
          const review = await dependencies.generateResumeReviewMarkdownFirst({
            jobDescriptionId,
            onDraftChange: (draft) => {
              if (!abortController.signal.aborted) {
                onDraftChange(draft);
              }
            },
            onEvent: (event) => handleEvent(event, abortController.signal),
            resumeProfile,
            signal: abortController.signal,
            workspaceSlug,
          });

          if (review && !abortController.signal.aborted) {
            onGenerated(review);
            dependencies.toast.success("已重新生成简历评价");
          }
        },
      });
    },
    [dependencies, handleEvent, onDraftChange, onGenerated, resetProgress, workspaceSlug],
  );

  useEffect(() => cancel, [cancel]);

  return { cancel, isGenerating, progressStatus, progressTools, regenerate, scoringPreview };
}
