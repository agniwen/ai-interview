"use client";

import type { CandidateFormTemplateSnapshot } from "@/lib/candidate-forms";
import { CheckIcon, ChevronDownIcon, ClipboardListIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildCandidateFormAnswersSchema } from "@/lib/candidate-forms";
import { cn } from "@/lib/utils";

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

function buildInitialAnswers(snapshot: CandidateFormTemplateSnapshot): Record<string, AnswerValue> {
  const answers: Record<string, AnswerValue> = {};
  for (const question of snapshot.questions) {
    answers[question.id] = question.type === "multi" ? [] : "";
  }
  return answers;
}

type FieldErrorMap = Record<string, string>;

function friendlyMessage(raw: string): string {
  // Surface the most common required-field complaints in candidate-friendly
  // wording; unknown messages fall through unchanged.
  if (raw.includes("不在可选项")) {
    return "请选择一项";
  }
  if (raw.includes("至少选择")) {
    return "请至少选择一项";
  }
  if (raw.includes("不能为空")) {
    return "请填写本题";
  }
  return raw;
}

// Run the same zod schema the server uses, then map issues back to their
// question id so the offending Field can be highlighted in place.
function validateAnswers(
  snapshot: CandidateFormTemplateSnapshot,
  answers: Record<string, AnswerValue>,
): FieldErrorMap {
  const schema = buildCandidateFormAnswersSchema(snapshot);
  const normalized: Record<string, AnswerValue> = {};
  for (const question of snapshot.questions) {
    const raw = answers[question.id];
    if (question.type === "multi") {
      normalized[question.id] = Array.isArray(raw) ? raw : [];
    } else {
      normalized[question.id] = typeof raw === "string" ? raw : "";
    }
  }

  const result = schema.safeParse(normalized);
  if (result.success) {
    return {};
  }

  const errors: FieldErrorMap = {};
  for (const issue of result.error.issues) {
    const [questionId] = issue.path;
    if (typeof questionId !== "string" || errors[questionId]) {
      continue;
    }
    errors[questionId] = friendlyMessage(issue.message);
  }
  return errors;
}

// Desktop multi-select rendered in a Popover with the same trigger styling
// as `<SelectTrigger>` so it visually matches single-select on the page.
function DesktopMultiSelect({
  question,
  value,
  onChange,
  invalid,
  inputId,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  invalid?: boolean;
  inputId: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(Array.isArray(value) ? value : []), [value]);

  const triggerLabel = useMemo(() => {
    if (selected.size === 0) {
      return "请选择";
    }
    return question.options
      .filter((option) => selected.has(option.value))
      .map((option) => option.label)
      .join("、");
  }, [question.options, selected]);

  function toggle(optionValue: string) {
    const next = new Set(selected);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    onChange([...next]);
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow]",
            "data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20",
            "focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
          data-invalid={invalid ? true : undefined}
          id={inputId}
          type="button"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              selected.size === 0 ? "text-muted-foreground" : "",
            )}
          >
            {triggerLabel}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-56 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="px-2 pt-1 pb-1.5 text-muted-foreground text-xs">可多选</p>
        <div className="max-h-64 overflow-y-auto">
          {question.options.map((option) => {
            const checked = selected.has(option.value);
            return (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  checked ? "bg-accent/50" : "",
                )}
                key={option.value}
                onClick={() => toggle(option.value)}
                type="button"
              >
                <CheckIcon
                  className={cn(
                    "size-4 shrink-0 text-primary",
                    checked ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex-1">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Mobile-friendly choice picker. The native `<Select>` dropdown and the
// inline chip list both feel cramped on phones, so on small screens we
// surface the options inside a bottom drawer with full-width tap targets.
function MobileChoicePicker({
  question,
  value,
  onChange,
  invalid,
  inputId,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  invalid?: boolean;
  inputId: string;
}) {
  const isMulti = question.type === "multi";
  const selectedValues = useMemo(() => {
    if (isMulti) {
      return new Set(Array.isArray(value) ? value : []);
    }
    const single = Array.isArray(value) ? (value[0] ?? "") : value;
    return new Set(single ? [single] : []);
  }, [isMulti, value]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(selectedValues);

  // Sync the in-drawer draft whenever the drawer opens (or external value
  // changes while it's closed) so the user always starts from current state.
  useEffect(() => {
    if (!open) {
      setDraft(selectedValues);
    }
  }, [open, selectedValues]);

  const triggerLabel = useMemo(() => {
    if (selectedValues.size === 0) {
      return "请选择";
    }
    return question.options
      .filter((option) => selectedValues.has(option.value))
      .map((option) => option.label)
      .join("、");
  }, [question.options, selectedValues]);

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <button
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow]",
          "data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20",
          "focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
        data-invalid={invalid ? true : undefined}
        id={inputId}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selectedValues.size === 0 ? "text-muted-foreground" : "",
          )}
        >
          {triggerLabel}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </button>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{isMulti ? "多选" : "单选"}</Badge>
            {question.required ? <span className="text-destructive text-xs">必填</span> : null}
          </div>
          <DrawerTitle className="leading-snug">{question.label}</DrawerTitle>
          {question.helperText ? (
            <DrawerDescription>{question.helperText}</DrawerDescription>
          ) : null}
        </DrawerHeader>
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-2">
          <div className="flex flex-col gap-1.5">
            {question.options.map((option) => {
              const checked = draft.has(option.value);
              return (
                <button
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    checked
                      ? "border-primary/50 bg-accent/60"
                      : "border-transparent hover:bg-accent",
                  )}
                  key={option.value}
                  onClick={() => {
                    if (isMulti) {
                      const next = new Set(draft);
                      if (checked) {
                        next.delete(option.value);
                      } else {
                        next.add(option.value);
                      }
                      setDraft(next);
                    } else {
                      // Single-choice: replace draft so the confirm button
                      // commits the freshly tapped option.
                      setDraft(new Set([option.value]));
                    }
                  }}
                  type="button"
                >
                  <span className="flex-1">{option.label}</span>
                  {checked ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <DrawerFooter>
          <Button
            size="lg"
            onClick={() => {
              if (isMulti) {
                onChange([...draft]);
              } else {
                const [next] = [...draft];
                onChange(next ?? "");
              }
              setOpen(false);
            }}
            type="button"
          >
            确认
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="outline" size="lg">
              取消
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// oxlint-disable-next-line complexity -- one branch per question type/display-mode combo, all flat conditionals.
function QuestionView({
  question,
  value,
  onChange,
  invalid,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  invalid?: boolean;
}) {
  const inputId = `q-${question.id}`;
  const invalidProp = invalid ? true : undefined;
  const isMobile = useIsMobile();

  if (
    isMobile &&
    question.displayMode === "select" &&
    (question.type === "single" || question.type === "multi")
  ) {
    return (
      <MobileChoicePicker
        inputId={inputId}
        invalid={invalid}
        onChange={onChange}
        question={question}
        value={value}
      />
    );
  }

  if (question.type === "single" && question.displayMode === "radio") {
    return (
      <RadioGroup
        aria-invalid={invalidProp}
        className={invalid ? "gap-1.5 rounded-md ring-2 ring-destructive/40 p-2" : "gap-1.5"}
        onValueChange={(next) => onChange(next)}
        value={typeof value === "string" ? value : ""}
      >
        {question.options.map((option) => (
          <Label
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 font-normal transition-colors hover:bg-accent has-[button[data-state=checked]]:border-primary/40 has-[button[data-state=checked]]:bg-accent/60"
            htmlFor={`${inputId}-${option.value}`}
            key={option.value}
          >
            <RadioGroupItem id={`${inputId}-${option.value}`} value={option.value} />
            <span className="flex-1">{option.label}</span>
          </Label>
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
        <SelectTrigger aria-invalid={invalidProp} className="w-full" id={inputId}>
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
      <div
        aria-invalid={invalidProp}
        className={
          invalid ? "space-y-1.5 rounded-md ring-2 ring-destructive/40 p-2" : "space-y-1.5"
        }
      >
        {question.options.map((option) => {
          const checked = selected.has(option.value);
          return (
            <Label
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 font-normal transition-colors hover:bg-accent has-[button[data-state=checked]]:border-primary/40 has-[button[data-state=checked]]:bg-accent/60"
              htmlFor={`${inputId}-${option.value}`}
              key={option.value}
            >
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
              <span className="flex-1">{option.label}</span>
            </Label>
          );
        })}
      </div>
    );
  }
  if (question.type === "multi" && question.displayMode === "select") {
    return (
      <DesktopMultiSelect
        inputId={inputId}
        invalid={invalid}
        onChange={onChange}
        question={question}
        value={value}
      />
    );
  }
  if (question.type === "text" && question.displayMode === "textarea") {
    return (
      <Textarea
        aria-invalid={invalidProp}
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
      aria-invalid={invalidProp}
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
  errors,
  onChange,
  submitted,
}: {
  template: RequiredTemplate;
  answers: Record<string, AnswerValue>;
  errors: FieldErrorMap;
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
        {template.snapshot.questions.map((question, index) => {
          const error = errors[question.id];
          return (
            <Field data-invalid={error ? true : undefined} key={question.id}>
              <FieldLabel htmlFor={`q-${question.id}`}>
                <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                {question.label}
                {question.required ? <span className="ml-1 text-destructive">*</span> : null}
              </FieldLabel>
              <FieldContent className="gap-2">
                {question.helperText ? (
                  <p className="text-muted-foreground text-xs">{question.helperText}</p>
                ) : null}
                <QuestionView
                  invalid={!!error}
                  onChange={(next) => onChange(question.id, next)}
                  question={question}
                  value={answers[question.id] ?? (question.type === "multi" ? [] : "")}
                />
                <FieldError>{error}</FieldError>
              </FieldContent>
            </Field>
          );
        })}
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
