"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useStore, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { FileUpIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { JobDescriptionSelectField } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { apiFetch, fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";

interface FieldErrorLike {
  message?: string;
}

/**
 * 将 TanStack Form 的原始错误数组转换为统一的 FieldErrorLike 格式。
 * Convert TanStack Form's raw error array into a uniform FieldErrorLike shape.
 */
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

/**
 * 计算文件选择器的显示文本：新文件 > 当前已有文件 > 兜底提示。
 * Compute the file picker label: new file > existing file > fallback hint.
 */
function filePickerLabel(newFile: File | null, existingName: string | null): string {
  if (newFile) {
    return newFile.name;
  }
  if (existingName) {
    return `当前：${existingName}`;
  }
  return "未上传 PDF，点击选择文件";
}

interface EditResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 要编辑的简历记录 ID，null 时对话框不执行查询。Record id to edit; null skips the query. */
  recordId: string | null;
  /** 保存成功后回调，携带最新详情。Callback with updated detail on success. */
  onUpdated: (detail: ResumeLibraryDetail) => void;
}

/**
 * 编辑简历库记录的对话框。加载现有记录后回填表单，保存时发送 PATCH 请求。
 * Dialog for editing an existing resume library record. Hydrates the form from
 * the detail endpoint and PATCHes on save.
 */
export function EditResumeDialog({
  open,
  onOpenChange,
  recordId,
  onUpdated,
}: EditResumeDialogProps) {
  const slug = useWorkspaceSlug();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 拉取当前记录详情，open + recordId 同时为真才触发。
  // Fetch the existing record; only enabled when the dialog is open and has a target id.
  const query = useQuery({
    enabled: open && Boolean(recordId),
    queryFn: () => fetchStudioResume(slug, recordId as string),
    queryKey: ["studio-resumes", slug, "edit-detail", recordId] as const,
    staleTime: 0,
  });

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      if (!recordId) {
        return;
      }
      const formData = new FormData();
      formData.append("candidateName", value.candidateName);
      formData.append("candidateEmail", value.candidateEmail);
      formData.append("candidatePhone", value.candidatePhone);
      formData.append("targetRole", value.targetRole);
      formData.append("jobDescriptionId", value.jobDescriptionId);
      formData.append("notes", value.notes);
      if (resumeFile) {
        formData.append("resume", resumeFile);
      }

      try {
        const detail = await apiFetch<ResumeLibraryDetail>(
          `/api/w/${slug}/studio/resumes/${recordId}`,
          { body: formData, method: "PATCH" },
        );
        toast.success("已保存");
        onUpdated(detail);
        onOpenChange(false);
        setResumeFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    },
    validators: { onSubmit: resumeLibraryFormSchema },
  });

  // 详情加载完成后回填表单；query.data 引用变更即触发。
  // Hydrate form once the detail resolves; keyed on query.data reference change.
  useEffect(() => {
    if (!query.data) {
      return;
    }
    form.reset({
      candidateEmail: query.data.candidateEmail ?? "",
      candidateName: query.data.candidateName,
      candidatePhone: query.data.candidatePhone ?? "",
      jobDescriptionId: query.data.jobDescriptionId ?? "",
      notes: query.data.notes ?? "",
      targetRole: query.data.targetRole ?? "",
    });
    // form 实例在渲染间稳定，此处仅依赖 query.data 的引用变化。
    // form instance is stable across renders; only depend on query.data identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <Modal onOpenChange={onOpenChange} open={open} size="md" title="编辑简历">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {/* 替换 PDF（可选）——显示当前文件名或新选文件名。
            Optional PDF replacement — shows the existing filename or newly selected file. */}
        <Field>
          <FieldLabel htmlFor="resume-upload-edit">替换简历 PDF（可选）</FieldLabel>
          <FieldContent className="gap-2">
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 border-dashed px-3 py-3 text-sm transition-colors hover:border-border"
              htmlFor="resume-upload-edit"
            >
              <FileUpIcon className="size-4" />
              <span>
                {/* 优先显示新选文件名，否则显示当前已上传文件名，最后兜底提示。
                    Show newly-selected filename first, then existing name, then fallback hint. */}
                {filePickerLabel(resumeFile, query.data?.resumeFileName ?? null)}
              </span>
            </label>
            <input
              accept="application/pdf"
              className="sr-only"
              id="resume-upload-edit"
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              ref={fileInputRef}
              type="file"
            />
          </FieldContent>
        </Field>

        <form.Field name="jobDescriptionId">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <JobDescriptionSelectField
                error={errors?.[0]?.message}
                onChange={(next) => field.handleChange(next)}
                value={field.state.value ?? ""}
              />
            );
          }}
        </form.Field>

        <FieldGroup className="grid gap-5 md:grid-cols-2 md:items-start">
          {(["candidateName", "candidateEmail", "candidatePhone", "targetRole"] as const).map(
            (name) => (
              <form.Field key={name} name={name}>
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  const labels = {
                    candidateEmail: "候选人邮箱",
                    candidateName: "候选人姓名",
                    candidatePhone: "联系电话",
                    targetRole: "目标岗位",
                  } as const;
                  const maxLengths = {
                    candidateEmail: 200,
                    candidateName: 120,
                    candidatePhone: 40,
                    targetRole: 120,
                  } as const;
                  return (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{labels[name]}</FieldLabel>
                      <FieldContent className="gap-2">
                        <Input
                          id={field.name}
                          maxLength={maxLengths[name]}
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
            ),
          )}
        </FieldGroup>

        <form.Field name="notes">
          {(field) => {
            const errors = toFieldErrors(field.state.meta.errors);
            return (
              <Field>
                <FieldLabel htmlFor={field.name}>备注</FieldLabel>
                <FieldContent className="gap-2">
                  <div className="relative">
                    <Textarea
                      className="min-h-24 pb-6"
                      id={field.name}
                      maxLength={2000}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      rows={4}
                      value={field.state.value}
                    />
                    <TextareaCounter maxLength={2000} value={field.state.value} />
                  </div>
                  <FieldError errors={errors} />
                </FieldContent>
              </Field>
            );
          }}
        </form.Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </form>
    </Modal>
  );
}
