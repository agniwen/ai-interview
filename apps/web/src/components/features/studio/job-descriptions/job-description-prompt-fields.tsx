"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { LazyMarkdownEditor as MarkdownEditor } from "@/components/features/markdown-editor/lazy-markdown-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import type { JobDescriptionFormApi } from "./job-description-form-values";
import {
  JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT,
  JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT,
  PROMPT_MAX_LENGTH,
} from "./job-description-form-values";

export function JobDescriptionPromptFields({
  form,
  handleGenerateJobDescription,
  isGeneratingJobDescription,
}: {
  form: JobDescriptionFormApi;
  handleGenerateJobDescription: () => void | Promise<void>;
  isGeneratingJobDescription: boolean;
}) {
  return (
    <form.Field name="prompt">
      {(field) => {
        const errors = toFieldErrors(field.state.meta.errors);
        return (
          <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
            <div className="flex min-h-8 items-center justify-between gap-3">
              <FieldLabel htmlFor={field.name}>
                岗位 JD <span className="text-destructive">*</span>
              </FieldLabel>
              <Button
                disabled={isGeneratingJobDescription || !field.state.value.trim()}
                onClick={() => handleGenerateJobDescription()}
                size="sm"
                type="button"
                variant="outline"
              >
                {isGeneratingJobDescription ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : null}
                {isGeneratingJobDescription ? "生成中…" : "一键优化 JD"}
              </Button>
            </div>
            <FieldContent
              className="min-h-0 gap-1"
              style={{ maxHeight: JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT }}
            >
              <MarkdownEditor
                aria-invalid={!!errors?.length}
                height={JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT}
                id={field.name}
                maxLength={PROMPT_MAX_LENGTH}
                onBlur={field.handleBlur}
                onChange={field.handleChange}
                placeholder="填写岗位职责、核心要求、经验与项目要求。内容较少也可以保存，建议尽量写清楚关键要求。"
                value={field.state.value}
              />
              {field.state.value.trim().length > 0 && field.state.value.trim().length < 80 ? (
                <p className="text-amber-600 text-xs dark:text-amber-400">
                  当前 JD 内容较少，仍可直接保存；补充职责、经验或技能要求可让 AI 评价更贴合岗位。
                </p>
              ) : null}
              <FieldError errors={errors} />
            </FieldContent>
          </Field>
        );
      }}
    </form.Field>
  );
}
