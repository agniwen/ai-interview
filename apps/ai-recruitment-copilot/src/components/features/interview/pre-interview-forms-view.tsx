"use client";

import { IconClipboardList, IconLoader2 } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InterviewBackground } from "./interview-background";
import { withCleanup } from "@/lib/client/async-control";
import { InterviewFlowFloatingBar } from "./interview-flow-floating-bar";
import { FormCard } from "./pre-interview-forms/form-card";
import { buildInitialAnswers, validateAnswers } from "./pre-interview-forms/helpers";
import type {
  AnswerValue,
  FieldErrorMap,
  FormsPayload,
  RequiredTemplate,
} from "./pre-interview-forms/types";

const formErrorPayloadSchema = z.object({ error: z.string().optional() });

function omitFieldError(errors: FieldErrorMap, questionId: string): FieldErrorMap {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== questionId));
}

export function fetchPreInterviewForms(
  interviewId: string,
  roundId: string,
): Promise<FormsPayload> {
  return rpcFetch(
    rpc.api.interview[":id"][":roundId"].forms.$get({
      param: { id: interviewId, roundId },
    }),
    "加载面试表单失败",
  );
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
  const payload = formErrorPayloadSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok) {
    return {
      error: payload.success ? (payload.data.error ?? "提交失败") : "提交失败",
      success: false,
    };
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
        return { ...prev, [templateId]: omitFieldError(current, questionId) };
      });
    },
    [],
  );

  const handleSubmitAll = useCallback(async () => {
    setSubmitting(true);
    await withCleanup(
      async () => {
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
          toast.error(`「${firstInvalidTitle}」还有内容需要补充，请查看页面提示。`);
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
        toast.success("信息已保存，感谢您的配合。");
      },
      () => setSubmitting(false),
    );
  }, [answersByTemplate, interviewId, pendingTemplates, roundId]);

  if (noFormsRequired || allSubmitted) {
    return <>{children}</>;
  }

  return (
    <>
      <InterviewBackground />
      <div className="fixed top-4 right-4 z-20 rounded-md bg-background/20 p-1 backdrop-blur-sm">
        <ThemeToggle />
      </div>
      <main className="relative flex h-dvh w-full select-none flex-col md:items-center">
        <ScrollArea className="h-full w-full">
          <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pt-12 pb-44 sm:px-6 sm:pt-20 sm:pb-40 md:pt-16">
            <section className="mb-8">
              <Badge className="mb-3">
                <IconClipboardList data-icon="inline-start" />
                开始前的面试表单
              </Badge>
              <h1 className="text-2xl tracking-tight sm:text-3xl">
                开始前，请补充本次面试所需信息
              </h1>
              <p className="mt-2 text-muted-foreground text-sm sm:text-base">
                这些信息将用于本轮面试。填写完成后，您可以继续进入面试。
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
            onClick={() => {
              handleSubmitAll();
            }}
            size="sm"
          >
            {submitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
            保存并继续
          </Button>
        }
        currentStep="forms"
        hasForms
        onBack={onBack}
      />
    </>
  );
}
