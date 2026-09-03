"use client";

/**
 * 单张表单卡片：渲染一个 RequiredTemplate 的标题、描述与全部问题。
 * Single form card: renders a RequiredTemplate's title, description, and all questions.
 *
 * 已提交后会以"半透明 + 已提交角标"展示，避免候选人误以为还能继续编辑。
 * Submitted forms render with a faded look and a "已提交" badge to discourage edits.
 */

import { Badge } from "@/components/ui/badge";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { QuestionView } from "./question-view";
import type { AnswerValue, FieldErrorMap, RequiredTemplate } from "./types";

export function FormCard({
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
          ? "rounded-xl border border-border bg-card/60 p-5 opacity-70"
          : "rounded-xl border border-border bg-card p-5"
      }
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">{template.snapshot.title}</h2>
          {template.snapshot.description ? (
            <p className="mt-1 text-muted-foreground text-sm">{template.snapshot.description}</p>
          ) : null}
        </div>
        {submitted ? (
          <Badge className="shrink-0" variant="success">
            已提交
          </Badge>
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
