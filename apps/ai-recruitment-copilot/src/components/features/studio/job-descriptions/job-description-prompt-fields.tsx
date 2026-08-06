"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { MarkdownEditor } from "@/components/features/markdown-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import type { JobDescriptionFormApi } from "./job-description-form-values";
import { DESCRIPTION_MAX_LENGTH, PROMPT_MAX_LENGTH } from "./job-description-form-values";

export function JobDescriptionPromptFields({
  evaluationFrozen,
  form,
  handleGenerateJobDescription,
  isGeneratingJobDescription,
  isLegacyJob,
}: {
  evaluationFrozen: boolean;
  form: JobDescriptionFormApi;
  handleGenerateJobDescription: () => void | Promise<void>;
  isGeneratingJobDescription: boolean;
  isLegacyJob: boolean;
}) {
  return (
    <>
      {isLegacyJob ? (
        <form.Field name="description">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                <FieldLabel htmlFor={field.name}>描述</FieldLabel>
                <FieldContent className="gap-1">
                  <div className="relative">
                    <Textarea
                      aria-invalid={!!errors?.length}
                      className="min-h-36 pb-6"
                      id={field.name}
                      disabled={evaluationFrozen}
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="简要描述岗位职责、要求等"
                      value={field.state.value ?? ""}
                    />
                    <TextareaCounter maxLength={DESCRIPTION_MAX_LENGTH} value={field.state.value} />
                  </div>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      ) : null}

      <form.Field name="prompt">
        {(field) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor={field.name}>
                  {isLegacyJob ? "岗位 Prompt" : "岗位 JD"}{" "}
                  <span className="text-destructive">*</span>
                </FieldLabel>
                {!isLegacyJob && !evaluationFrozen ? (
                  <Button
                    disabled={isGeneratingJobDescription || !field.state.value.trim()}
                    onClick={() => void handleGenerateJobDescription()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isGeneratingJobDescription ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : null}
                    {isGeneratingJobDescription ? "生成中…" : "一键生成 JD"}
                  </Button>
                ) : null}
              </div>
              <FieldContent className="gap-1">
                <MarkdownEditor
                  aria-invalid={!!errors?.length}
                  id={field.name}
                  disabled={evaluationFrozen}
                  maxLength={PROMPT_MAX_LENGTH}
                  minHeight={isLegacyJob ? 112 : 192}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  placeholder={
                    isLegacyJob
                      ? "岗位关键职责、技术栈要求、期望的考察维度……"
                      : "明确填写岗位职责、核心与辅助技能、经验、项目、学历及其他要求……"
                  }
                  showPreview
                  value={field.state.value}
                />
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>
    </>
  );
}
