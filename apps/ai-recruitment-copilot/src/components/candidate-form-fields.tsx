"use client";

import type { ChangeEvent, ReactNode } from "react";
import type { ReactFormExtendedApi } from "@tanstack/react-form";
import { FileUpIcon } from "lucide-react";
import { useRef } from "react";
import { JobDescriptionSelectField } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ResumeLibraryFormValues } from "@/lib/shared/studio-resumes";
import { RESUME_LIBRARY_NOTES_INPUT_MAX_LENGTH } from "@/lib/shared/studio-resumes";

/**
 * 候选人/简历字段公共表单组件。TanStack Form 受控。
 * 用于简历库的上传 / 编辑弹窗（以及未来需要采集候选人信息的任何场景）。
 *
 * Shared candidate / resume fields, TanStack-Form-controlled. Used by the
 * resume library upload + edit dialogs (and any future flow that needs to
 * capture the same identity fields).
 */

interface FieldErrorLike {
  message?: string;
}

function toFieldErrors(errors: unknown[] | undefined): FieldErrorLike[] | undefined {
  // oxlint-disable-next-line promise/prefer-await-to-callbacks
  const mapped = (errors ?? []).flatMap((err) => {
    if (!err) {
      return [];
    }
    if (typeof err === "string") {
      return [{ message: err }];
    }
    if (typeof err === "object" && "message" in err) {
      const message =
        typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : undefined;
      return [{ message }];
    }
    return [];
  });
  return mapped.length > 0 ? mapped : undefined;
}

// oxlint-disable no-explicit-any -- TanStack Form has 11 validator generics after TFormData; only the values type matters here.
export type CandidateFormApi = ReactFormExtendedApi<
  ResumeLibraryFormValues,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;
// oxlint-enable no-explicit-any

export interface CandidateFormFieldsProps {
  form: CandidateFormApi;
  resumeFile: File | null;
  onResumeFileChange: (file: File | null) => void;
  /** 上传/编辑场景下拖拽区的提示文本。 Upload / edit drag-area placeholder text. */
  resumeFilePlaceholder?: string;
  /** 编辑场景显示现有文件名；上传场景为 null。 Existing file name shown in edit mode; null in upload mode. */
  existingResumeFileName?: string | null;
  /** 在 PDF 字段下方注入额外内容（例如「简历正在解析」状态）。 Slot below the PDF field (e.g. parsing progress). */
  resumeFieldExtra?: ReactNode;
  /** 候选人姓名字段的 placeholder。 Placeholder for the candidate name input. */
  candidateNamePlaceholder?: string;
  disabled?: boolean;
  /** false 时只显示简历 PDF 字段；用于新建弹窗解析完成前的初始状态。 */
  showDetails?: boolean;
  /**
   * true 时：简历 PDF 字段显示为必填（红星 + 不再带"可选"），并且在未选 / 未上传过
   * PDF 之前隐藏候选人姓名 / 邮箱 / 电话 / 目标岗位四个字段——避免用户在没解析依据时
   * 手填一遍又被自动回填覆盖。新建简历记录走这条路；编辑场景保持原来的全字段展示。
   * When true, mark the resume-PDF field as required (red asterisk, no "可选"
   * label) and hide the candidate name / email / phone / target-role fields
   * until a PDF is selected or already attached — keeps users from filling
   * fields that will be overwritten by parse. The "create" flow opts in; the
   * "edit" flow leaves it false so every field stays visible.
   */
  requireResumeFile?: boolean;
  /**
   * true 时在「关联在招岗位」下拉框上显示 loading 状态（spinner + 占位提示）。
   * 用于简历解析完成后自动匹配岗位的那一小段时间。
   * When true, the JD select renders a loading affordance (spinner + hint).
   * Used while the post-parse auto-match request is in flight.
   */
  isJobDescriptionMatching?: boolean;
}

const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 200;
const PHONE_MAX_LENGTH = 40;
const TARGET_ROLE_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = RESUME_LIBRARY_NOTES_INPUT_MAX_LENGTH;

function describeResumeFileLabel({
  newFile,
  existingName,
  placeholder,
}: {
  newFile: File | null;
  existingName: string | null | undefined;
  placeholder: string;
}) {
  if (newFile) {
    return newFile.name;
  }
  if (existingName) {
    return `当前：${existingName}`;
  }
  return placeholder;
}

export function CandidateFormFields({
  form,
  resumeFile,
  onResumeFileChange,
  resumeFilePlaceholder = "点击选择 PDF 文件，可留空",
  existingResumeFileName = null,
  resumeFieldExtra,
  candidateNamePlaceholder = "可留空，自动从简历回填",
  disabled,
  showDetails = true,
  requireResumeFile = false,
  isJobDescriptionMatching = false,
}: CandidateFormFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resumeFieldLabel = describeResumeFileLabel({
    existingName: existingResumeFileName,
    newFile: resumeFile,
    placeholder: resumeFilePlaceholder,
  });
  // "上传过 PDF" 的判定：当次刚选的 File，或者编辑场景下后端已存好的 storageKey → fileName。
  // "Has a resume" = either a freshly-picked File or an existing file name from
  // the server (edit mode populates existingResumeFileName from resumeStorageKey).
  const hasResume = Boolean(resumeFile) || Boolean(existingResumeFileName);
  const showIdentityFields = showDetails && (!requireResumeFile || hasResume);

  function clearFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openFilePicker() {
    clearFileInput();
    fileInputRef.current?.click();
  }

  function handleResumeInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    onResumeFileChange(file);
  }

  return (
    <div className="space-y-5">
      <Field>
        <FieldLabel htmlFor="candidate-resume-upload">
          简历 PDF
          {requireResumeFile ? (
            <span aria-hidden className="ml-1 text-destructive">
              *
            </span>
          ) : (
            "（可选）"
          )}
        </FieldLabel>
        <FieldContent className="gap-2">
          <Button
            className="w-full justify-start overflow-hidden"
            disabled={disabled}
            onClick={openFilePicker}
            type="button"
            size={"lg"}
            variant="outline"
          >
            <FileUpIcon data-icon="inline-start" />
            <span className="min-w-0 truncate">{resumeFieldLabel}</span>
          </Button>
          <input
            accept="application/pdf"
            aria-label="上传候选人简历 PDF"
            className="sr-only"
            disabled={disabled}
            id="candidate-resume-upload"
            onChange={handleResumeInputChange}
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          {resumeFieldExtra}
        </FieldContent>
      </Field>

      {showDetails ? (
        <form.Field name="jobDescriptionId">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <JobDescriptionSelectField
                disabled={disabled}
                error={errors?.[0]?.message}
                matching={isJobDescriptionMatching}
                onChange={(next) => field.handleChange(next)}
                value={field.state.value ?? ""}
              />
            );
          }}
        </form.Field>
      ) : null}

      {showIdentityFields ? (
        <FieldGroup className="grid gap-5 md:grid-cols-2 md:items-start">
          <form.Field name="candidateName">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>候选人姓名</FieldLabel>
                  <FieldContent className="gap-2">
                    <Input
                      disabled={disabled}
                      id={field.name}
                      maxLength={NAME_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={candidateNamePlaceholder}
                      value={field.state.value}
                    />
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="candidateEmail">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>候选人邮箱</FieldLabel>
                  <FieldContent className="gap-2">
                    <Input
                      disabled={disabled}
                      id={field.name}
                      maxLength={EMAIL_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="candidate@example.com"
                      value={field.state.value}
                    />
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="candidatePhone">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>联系电话</FieldLabel>
                  <FieldContent className="gap-2">
                    <Input
                      disabled={disabled}
                      id={field.name}
                      maxLength={PHONE_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      value={field.state.value}
                    />
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="targetRole">
            {(field) => {
              const errors = toFieldErrors(field.state.meta.errors);
              return (
                <Field>
                  <FieldLabel htmlFor={field.name}>目标岗位</FieldLabel>
                  <FieldContent className="gap-2">
                    <Input
                      disabled={disabled}
                      id={field.name}
                      maxLength={TARGET_ROLE_MAX_LENGTH}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="如：前端工程师"
                      value={field.state.value}
                    />
                    <FieldError errors={errors} />
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
      ) : null}

      {showDetails ? (
        <form.Field name="notes">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field>
                <FieldLabel htmlFor={field.name}>简历评价</FieldLabel>
                <FieldContent className="gap-2">
                  <MarkdownEditor
                    aria-invalid={!!errors?.length}
                    disabled={disabled}
                    id={field.name}
                    maxLength={NOTES_MAX_LENGTH}
                    minHeight={180}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    placeholder="对候选人简历的评价、来源、业务线、关注点等"
                    value={field.state.value}
                  />
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>
      ) : null}
    </div>
  );
}
