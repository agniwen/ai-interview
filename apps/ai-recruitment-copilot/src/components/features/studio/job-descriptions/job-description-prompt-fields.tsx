"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { MarkdownEditor } from "@/components/features/markdown-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import type { JobDescriptionFormApi } from "./job-description-form-values";
import {
  DESCRIPTION_MAX_LENGTH,
  JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT,
  JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT,
  PROMPT_MAX_LENGTH,
} from "./job-description-form-values";
import { JobDescriptionMarkdownSurface } from "./job-description-markdown-surface";

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
            <Field
              className={isLegacyJob ? undefined : "contents"}
              data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}
            >
              <div className="flex min-h-8 items-center justify-between gap-3">
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
              <FieldContent
                className={isLegacyJob ? "gap-1" : "h-full min-h-0 gap-1"}
                style={isLegacyJob ? undefined : { maxHeight: JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT }}
              >
                {evaluationFrozen ? (
                  <JobDescriptionMarkdownSurface
                    className={isLegacyJob ? undefined : "min-h-0 flex-1"}
                    content={field.state.value}
                    height={isLegacyJob ? 112 : null}
                    id={field.name}
                  />
                ) : (
                  <MarkdownEditor
                    aria-invalid={!!errors?.length}
                    className={isLegacyJob ? undefined : "min-h-0 flex-1"}
                    height={isLegacyJob ? 112 : JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT}
                    id={field.name}
                    maxLength={PROMPT_MAX_LENGTH}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    placeholder={
                      isLegacyJob
                        ? "岗位关键职责、技术栈要求、期望的考察维度……"
                        : "明确填写岗位职责、核心与辅助技能、经验、项目、学历及其他要求……"
                    }
                    value={field.state.value}
                  />
                )}
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>
    </>
  );
}
