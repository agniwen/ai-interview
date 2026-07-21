"use client";

import { IconClipboardList, IconLoader2 } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { rpc } from "@/lib/client/rpc";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InterviewFlowFloatingBar } from "./interview-flow-floating-bar";
import { FormCard } from "./pre-interview-forms/form-card";
import { buildInitialAnswers, validateAnswers } from "./pre-interview-forms/helpers";
import type {
  AnswerValue,
  FieldErrorMap,
  FormsPayload,
  RequiredTemplate,
} from "./pre-interview-forms/types";

export async function fetchPreInterviewForms(
  interviewId: string,
  roundId: string,
): Promise<FormsPayload> {
  const response = await rpc.api.interview[":id"][":roundId"].forms.$get({
    param: { id: interviewId, roundId },
  });
  const payload = (await response.json()) as FormsPayload | { error?: string };
  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "加载面试表单失败");
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
  const response = await rpc.api.interview[":id"][":roundId"].forms[":templateId"].submit.$post({
    json: { answers, versionId },
    param: { id: interviewId, roundId, templateId },
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    return { error: payload?.error ?? "提交失败", success: false };
  }
  return { success: true };
}

export function PreInterviewFormsView({
  interviewId,
  initialPayload,
  roundId,
  onAllCompleted,
  onBack,
  children,
}: {
  interviewId: string;
  initialPayload: FormsPayload;
  roundId: string;
  onAllCompleted?: () => void;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const [templates] = useState<RequiredTemplate[]>(() => initialPayload.required);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(
    () => new Set(Object.keys(initialPayload.submitted)),
  );
  const [errorsByTemplate, setErrorsByTemplate] = useState<Record<string, FieldErrorMap>>({});
  const [submitting, setSubmitting] = useState(false);

  const [answersByTemplate, setAnswersByTemplate] = useState<
    Record<string, Record<string, AnswerValue>>
  >(() => {
    const initial: Record<string, Record<string, AnswerValue>> = {};
    for (const template of initialPayload.required) {
      initial[template.templateId] = buildInitialAnswers(template.snapshot);
    }
    return initial;
  });

  const pendingTemplates = templates.filter((t) => !submittedIds.has(t.templateId));
  const allSubmitted = templates.length > 0 && pendingTemplates.length === 0;
  const noFormsRequired = templates.length === 0;

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
      <main className="relative flex h-dvh w-full select-none flex-col md:items-center">
        <ScrollArea className="h-full w-full">
          <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pt-12 pb-44 sm:px-6 sm:pt-20 sm:pb-40 md:pt-16">
            <section className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">
                <IconClipboardList className="size-3.5" />
                开始前的面试表单
              </div>
              <h1 className="text-2xl tracking-tight sm:text-3xl">开始前请先填写面试表单</h1>
              <p className="mt-2 text-muted-foreground text-sm sm:text-base">
                完成全部面试表单后进入面试。
              </p>
            </section>

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
            </div>
          </div>
        </ScrollArea>
      </main>
      <InterviewFlowFloatingBar
        actions={
          <Button
            disabled={submitting || pendingTemplates.length === 0}
            onClick={() => void handleSubmitAll()}
            size="sm"
          >
            {submitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
            提交并继续
          </Button>
        }
        currentStep="forms"
        hasForms
        onBack={onBack}
      />
    </>
  );
}
