"use client";

import type { CandidateFormTemplateSnapshot } from "@/lib/candidate-forms";
import { ClipboardListIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AnswerValue = string | string[];

interface RequiredTemplate {
  templateId: string;
  versionId: string;
  version: number;
  snapshot: CandidateFormTemplateSnapshot;
}

interface FormsPayload {
  required: RequiredTemplate[];
  submitted: Record<string, { versionId: string; submittedAt: string } | true>;
}

async function fetchForms(interviewId: string, roundId: string): Promise<FormsPayload> {
  const response = await fetch(`/api/interview/${interviewId}/${roundId}/forms`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "加载问卷失败");
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

function buildInitialAnswers(snapshot: CandidateFormTemplateSnapshot): Record<string, AnswerValue> {
  const answers: Record<string, AnswerValue> = {};
  for (const question of snapshot.questions) {
    answers[question.id] = question.type === "multi" ? [] : "";
  }
  return answers;
}

function validateAnswers(
  snapshot: CandidateFormTemplateSnapshot,
  answers: Record<string, AnswerValue>,
): string | null {
  for (const question of snapshot.questions) {
    if (!question.required) {
      continue;
    }
    const value = answers[question.id];
    if (question.type === "multi") {
      if (!Array.isArray(value) || value.length === 0) {
        return `请作答：${question.label}`;
      }
    } else if (!value || (typeof value === "string" && value.trim() === "")) {
      return `请作答：${question.label}`;
    }
  }
  return null;
}

function QuestionView({
  question,
  value,
  onChange,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const inputId = `q-${question.id}`;

  if (question.type === "single" && question.displayMode === "radio") {
    return (
      <RadioGroup
        onValueChange={(next) => onChange(next)}
        value={typeof value === "string" ? value : ""}
      >
        {question.options.map((option) => (
          <div className="flex items-center gap-2" key={option.value}>
            <RadioGroupItem id={`${inputId}-${option.value}`} value={option.value} />
            <Label className="font-normal" htmlFor={`${inputId}-${option.value}`}>
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  }
  if (question.type === "single" && question.displayMode === "select") {
    return (
      <Select
        onValueChange={(next) => onChange(next)}
        value={typeof value === "string" ? value : undefined}
      >
        <SelectTrigger id={inputId}>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          {question.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (question.type === "multi" && question.displayMode === "checkbox") {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <div className="space-y-2">
        {question.options.map((option) => {
          const checked = selected.has(option.value);
          return (
            <div className="flex items-center gap-2" key={option.value}>
              <Checkbox
                checked={checked}
                id={`${inputId}-${option.value}`}
                onCheckedChange={(nextChecked) => {
                  const next = new Set(selected);
                  if (nextChecked) {
                    next.add(option.value);
                  } else {
                    next.delete(option.value);
                  }
                  onChange([...next]);
                }}
              />
              <Label className="font-normal" htmlFor={`${inputId}-${option.value}`}>
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
    );
  }
  if (question.type === "multi" && question.displayMode === "select") {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">可多选</p>
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => {
            const active = selected.has(option.value);
            return (
              <button
                className={
                  active
                    ? "rounded-md border border-primary bg-primary px-3 py-1.5 text-primary-foreground text-sm"
                    : "rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                }
                key={option.value}
                onClick={() => {
                  const next = new Set(selected);
                  if (active) {
                    next.delete(option.value);
                  } else {
                    next.add(option.value);
                  }
                  onChange([...next]);
                }}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (question.type === "text" && question.displayMode === "textarea") {
    return (
      <Textarea
        className="min-h-24"
        id={inputId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="请输入你的回答"
        value={typeof value === "string" ? value : ""}
      />
    );
  }
  return (
    <Input
      id={inputId}
      onChange={(event) => onChange(event.target.value)}
      placeholder="请输入你的回答"
      value={typeof value === "string" ? value : ""}
    />
  );
}

function FormCard({
  template,
  answers,
  onChange,
  submitted,
}: {
  template: RequiredTemplate;
  answers: Record<string, AnswerValue>;
  onChange: (questionId: string, value: AnswerValue) => void;
  submitted: boolean;
}) {
  return (
    <section
      className={
        submitted
          ? "rounded-xl border border-border/60 bg-card/60 p-5 opacity-70"
          : "rounded-xl border border-border/60 bg-card p-5"
      }
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">{template.snapshot.title}</h2>
          {template.snapshot.description ? (
            <p className="mt-1 text-muted-foreground text-sm">{template.snapshot.description}</p>
          ) : null}
        </div>
        {submitted ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
            已提交
          </span>
        ) : null}
      </header>
      <div className="space-y-5">
        {template.snapshot.questions.map((question) => (
          <div className="space-y-2" key={question.id}>
            <Label className="font-medium text-sm" htmlFor={`q-${question.id}`}>
              {question.label}
              {question.required ? <span className="ml-1 text-destructive">*</span> : null}
            </Label>
            {question.helperText ? (
              <p className="text-muted-foreground text-xs">{question.helperText}</p>
            ) : null}
            <QuestionView
              onChange={(next) => onChange(question.id, next)}
              question={question}
              value={answers[question.id] ?? (question.type === "multi" ? [] : "")}
            />
          </div>
        ))}
      </div>
    </section>
  );
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
          setLoadError(error instanceof Error ? error.message : "加载问卷失败");
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
    },
    [],
  );

  const handleSubmitAll = useCallback(async () => {
    setSubmitting(true);
    try {
      for (const template of pendingTemplates) {
        const answers = answersByTemplate[template.templateId] ?? {};
        const error = validateAnswers(template.snapshot, answers);
        if (error) {
          toast.error(`「${template.snapshot.title}」${error}`);
          return;
        }
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
      toast.success("问卷已提交");
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
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-prep-dark.png')] bg-center bg-cover bg-no-repeat invert dark:invert-0"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white/5 dark:hidden" />
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="relative flex min-h-dvh w-full flex-col md:items-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-5 pt-12 pb-32 sm:px-2 sm:pt-20 md:py-16">
          <section className="mb-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-primary text-xs">
              <ClipboardListIcon className="size-3.5" />
              开始前的问卷
            </div>
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
              开始前请先填写问卷
            </h1>
            <p className="mt-2 text-muted-foreground text-sm sm:text-base">
              完成全部问卷后才能进入面试。你的回答会在提交那一刻冻结保存，之后问卷模版若被修改也不会影响。
            </p>
          </section>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              正在加载问卷…
            </div>
          ) : null}

          {loadError ? (
            <p className="py-10 text-center text-destructive text-sm">{loadError}</p>
          ) : null}

          {!loading && !loadError ? (
            <div className="space-y-4">
              {templates.map((template) => (
                <FormCard
                  answers={answersByTemplate[template.templateId] ?? {}}
                  key={template.templateId}
                  onChange={(questionId, value) =>
                    handleChangeAnswer(template.templateId, questionId, value)
                  }
                  submitted={submittedIds.has(template.templateId)}
                  template={template}
                />
              ))}

              <div className="sticky bottom-0 z-10 -mx-5 border-border/60 border-t bg-background/90 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-2 sm:px-2">
                <Button
                  className="h-11 w-full"
                  disabled={submitting || pendingTemplates.length === 0}
                  onClick={() => void handleSubmitAll()}
                  size="lg"
                >
                  {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  提交并继续
                </Button>
                <p className="mt-2 text-center text-muted-foreground text-xs">
                  还需填写 {pendingTemplates.length} 份问卷
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
