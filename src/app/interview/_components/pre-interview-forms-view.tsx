"use client";

import { ClipboardListIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FormCard } from "./pre-interview-forms/form-card";
import { buildInitialAnswers, validateAnswers } from "./pre-interview-forms/helpers";
import type {
  AnswerValue,
  FieldErrorMap,
  FormsPayload,
  RequiredTemplate,
} from "./pre-interview-forms/types";

async function fetchForms(interviewId: string, roundId: string): Promise<FormsPayload> {
  const response = await fetch(`/api/interview/${interviewId}/${roundId}/forms`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "加载面试表单失败");
  }
  return payload as FormsPayload;
}

async function submitForm(
  interviewId: string,
  roundId: string,
  templateId: string,
  versionId: string,
  answers: Record<string, AnswerValue>,
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(
    `/api/interview/${interviewId}/${roundId}/forms/${templateId}/submit`,
    {
      body: JSON.stringify({ answers, versionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    return { error: payload?.error ?? "提交失败", success: false };
  }
  return { success: true };
}

export function PreInterviewFormsView({
  interviewId,
  roundId,
  onAllCompleted,
  children,
}: {
  interviewId: string;
  roundId: string;
  onAllCompleted?: () => void;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RequiredTemplate[]>([]);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [answersByTemplate, setAnswersByTemplate] = useState<
    Record<string, Record<string, AnswerValue>>
  >({});
  const [errorsByTemplate, setErrorsByTemplate] = useState<Record<string, FieldErrorMap>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    async function load() {
      try {
        const payload = await fetchForms(interviewId, roundId);
        if (cancelled) {
          return;
        }
        setTemplates(payload.required);
        const initial: Record<string, Record<string, AnswerValue>> = {};
        for (const template of payload.required) {
          initial[template.templateId] = buildInitialAnswers(template.snapshot);
        }
        setAnswersByTemplate(initial);
        setSubmittedIds(new Set(Object.keys(payload.submitted)));
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "加载面试表单失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [interviewId, roundId]);

  const pendingTemplates = templates.filter((t) => !submittedIds.has(t.templateId));
  const allSubmitted = !loading && templates.length > 0 && pendingTemplates.length === 0;
  const noFormsRequired = !loading && templates.length === 0;

  useEffect(() => {
    if (allSubmitted || noFormsRequired) {
      onAllCompleted?.();
    }
  }, [allSubmitted, noFormsRequired, onAllCompleted]);

  const handleChangeAnswer = useCallback(
    (templateId: string, questionId: string, value: AnswerValue) => {
      setAnswersByTemplate((prev) => ({
        ...prev,
        [templateId]: { ...prev[templateId], [questionId]: value },
      }));
      // Clear the per-question error as soon as the user touches it again,
      // so the red highlight goes away without waiting for re-submit.
      setErrorsByTemplate((prev) => {
        const current = prev[templateId];
        if (!current?.[questionId]) {
          return prev;
        }
        const { [questionId]: _removed, ...rest } = current;
        return { ...prev, [templateId]: rest };
      });
    },
    [],
  );

  const handleSubmitAll = useCallback(async () => {
    setSubmitting(true);
    try {
      const nextErrors: Record<string, FieldErrorMap> = {};
      let firstInvalidTitle: string | null = null;
      for (const template of pendingTemplates) {
        const answers = answersByTemplate[template.templateId] ?? {};
        const errors = validateAnswers(template.snapshot, answers);
        if (Object.keys(errors).length > 0) {
          nextErrors[template.templateId] = errors;
          if (!firstInvalidTitle) {
            firstInvalidTitle = template.snapshot.title;
          }
        }
      }
      setErrorsByTemplate(nextErrors);
      if (firstInvalidTitle) {
        toast.error(`「${firstInvalidTitle}」有未完成的题目，请检查标红的内容`);
        return;
      }
      for (const template of pendingTemplates) {
        const answers = answersByTemplate[template.templateId] ?? {};
        const result = await submitForm(
          interviewId,
          roundId,
          template.templateId,
          template.versionId,
          answers,
        );
        if (!result.success) {
          toast.error(`「${template.snapshot.title}」${result.error ?? "提交失败"}`);
          return;
        }
        setSubmittedIds((prev) => new Set([...prev, template.templateId]));
      }
      toast.success("面试表单已提交");
    } finally {
      setSubmitting(false);
    }
  }, [answersByTemplate, interviewId, pendingTemplates, roundId]);

  if (noFormsRequired || allSubmitted) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-prep-light.png')] bg-center bg-cover bg-no-repeat dark:bg-[url('/textures/interview-prep-dark.png')]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white/5 dark:hidden" />
      <div className="fixed top-4 right-4 z-20 rounded-md bg-background/20 p-1 backdrop-blur-sm">
        <ThemeToggle />
      </div>
      <main className="relative flex h-dvh w-full flex-col md:items-center">
        <ScrollArea className="h-full w-full">
          <div className="mx-auto flex w-full max-w-2xl flex-col px-5 pt-12  sm:px-2 sm:pt-20 md:pt-16">
            <section className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">
                <ClipboardListIcon className="size-3.5" />
                开始前的面试表单
              </div>
              <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
                开始前请先填写面试表单
              </h1>
              <p className="mt-2 text-muted-foreground text-sm sm:text-base">
                完成全部面试表单后进入面试。
              </p>
            </section>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
                <Loader2Icon className="size-4 animate-spin" />
                正在检查面试表单填写情况
              </div>
            ) : null}

            {loadError ? (
              <p className="py-10 text-center text-destructive text-sm">{loadError}</p>
            ) : null}

            {!loading && !loadError ? (
              <div className="space-y-4">
                {pendingTemplates.map((template) => (
                  <FormCard
                    answers={answersByTemplate[template.templateId] ?? {}}
                    errors={errorsByTemplate[template.templateId] ?? {}}
                    key={template.templateId}
                    onChange={(questionId, value) =>
                      handleChangeAnswer(template.templateId, questionId, value)
                    }
                    submitted={false}
                    template={template}
                  />
                ))}

                <div className="sticky bottom-0 z-10 -mx-5 border-border/60 border-t px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-2 sm:px-2">
                  <Button
                    className="h-11 w-full"
                    disabled={submitting || pendingTemplates.length === 0}
                    onClick={() => void handleSubmitAll()}
                    size="lg"
                  >
                    {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
                    提交并继续
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </main>
    </>
  );
}
