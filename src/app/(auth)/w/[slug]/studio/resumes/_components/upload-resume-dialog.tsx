"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useStore, useForm } from "@tanstack/react-form";
import { FileUpIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { JobDescriptionSelectField } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-select-field";
import { ResumeDedupOverlay } from "@/components/resume-dedup-overlay";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import type { DedupMatchRecord } from "@/lib/client/api";
import { apiFetch, fetchResumeDedup } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";

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

/**
 * 将表单值和文件组装成 FormData。
 * Assemble form values and optional file into a FormData object.
 */
function buildFormData(
  value: {
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    targetRole: string;
    jobDescriptionId: string;
    notes: string;
  },
  file: File | null,
): FormData {
  const formData = new FormData();
  formData.append("candidateName", value.candidateName);
  formData.append("candidateEmail", value.candidateEmail);
  formData.append("candidatePhone", value.candidatePhone);
  formData.append("targetRole", value.targetRole);
  formData.append("jobDescriptionId", value.jobDescriptionId);
  formData.append("notes", value.notes);
  if (file) {
    formData.append("resume", file);
  }
  return formData;
}

/**
 * 上传简历到简历库的对话框。
 * Dialog for uploading a resume into the resume library.
 *
 * 不生成面试题，不发起 AI 面试。身份查重命中时展示 ResumeDedupOverlay 供用户确认。
 * Does not generate questions or start an AI interview. Shows ResumeDedupOverlay
 * when duplicates are found so the user can confirm before proceeding.
 */
export function UploadResumeDialog({
  onCreated,
}: {
  onCreated: (detail: ResumeLibraryDetail) => void;
}) {
  const slug = useWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 查重命中时保存 matches，展示 overlay；null 表示无需确认。
  // Holds dedup matches while the overlay is visible; null means no confirmation needed.
  const [dedupMatches, setDedupMatches] = useState<DedupMatchRecord[] | null>(null);
  // 查重通过后缓存待发送的 FormData，等用户点「继续」后复用。
  // Cached FormData ready to POST once the user dismisses the dedup overlay.
  const pendingFormDataRef = useRef<FormData | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 用 ref 持有成功回调，避免 onSubmit 闭包内引用 form（use-before-define）。
  // Hold the success handler in a ref so onSubmit doesn't close over `form` before it's defined.
  const onSuccessRef = useRef<((detail: ResumeLibraryDetail) => void) | null>(null);

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      setSubmitting(true);
      try {
        // 1) 身份维度查重预警（任一字段命中则展示 overlay）。
        //    Show dedup overlay if any identity field matches an existing record.
        if (value.candidateName || value.candidateEmail || value.candidatePhone) {
          const { matches } = await fetchResumeDedup(slug, {
            email: value.candidateEmail || null,
            name: value.candidateName || null,
            phone: value.candidatePhone || null,
          });
          if (matches.length > 0) {
            // 2) 组装 FormData 并暂存，等用户点「继续录入」后再发送。
            //    Build FormData now and stash it; POST only after user confirms.
            pendingFormDataRef.current = buildFormData(value, resumeFile);
            setDedupMatches(matches);
            setSubmitting(false);
            return;
          }
        }

        // 3) 无查重命中，直接 POST。
        //    No duplicates — POST immediately.
        const detail = await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes`, {
          body: buildFormData(value, resumeFile),
          method: "POST",
        });
        onSuccessRef.current?.(detail);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "上传失败");
      } finally {
        setSubmitting(false);
      }
    },
    validators: {
      onSubmit: resumeLibraryFormSchema,
    },
  });

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  // overlay 显示时也视为「忙」，禁止关闭弹窗。
  // The dedup overlay also counts as busy — block modal dismiss.
  const isBusy = submitting || isSubmitting || Boolean(dedupMatches);

  /**
   * 成功上传后重置所有本地状态并通知父组件。
   * Reset local state and notify the parent after a successful upload.
   */
  onSuccessRef.current = (detail: ResumeLibraryDetail) => {
    toast.success("简历已加入简历库");
    onCreated(detail);
    setOpen(false);
    form.reset(createResumeLibraryFormValues());
    setResumeFile(null);
    pendingFormDataRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  async function handleDedupContinue() {
    const formData = pendingFormDataRef.current;
    setDedupMatches(null);
    pendingFormDataRef.current = null;
    if (!formData) {
      return;
    }
    setSubmitting(true);
    try {
      const detail = await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes`, {
        body: formData,
        method: "POST",
      });
      onSuccessRef.current?.(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDedupCancel() {
    setDedupMatches(null);
    pendingFormDataRef.current = null;
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <UploadIcon className="size-4" />
        上传简历
      </Button>

      <Modal
        onOpenChange={(next) => {
          if (!next && isBusy) {
            return;
          }
          setOpen(next);
        }}
        open={open}
        title="上传简历"
        description="将候选人简历加入简历库。不会生成面试题，也不会发起 AI 面试。"
        size="md"
        dismissible={!isBusy}
        showCloseButton={!isBusy}
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="resume-upload">简历 PDF（可选）</FieldLabel>
            <FieldContent className="gap-2">
              <label
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 border-dashed px-3 py-3 text-sm transition-colors hover:border-border"
                htmlFor="resume-upload"
              >
                <FileUpIcon className="size-4" />
                <span>{resumeFile ? resumeFile.name : "点击选择 PDF 文件，可留空"}</span>
              </label>
              <input
                accept="application/pdf"
                className="sr-only"
                id="resume-upload"
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
            <form.Field name="candidateName">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field>
                    <FieldLabel htmlFor={field.name}>候选人姓名</FieldLabel>
                    <FieldContent className="gap-2">
                      <Input
                        id={field.name}
                        maxLength={120}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="可留空，自动从简历回填"
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
                        id={field.name}
                        maxLength={200}
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
                        id={field.name}
                        maxLength={40}
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
                        id={field.name}
                        maxLength={120}
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
                        placeholder="候选人来源、业务线、关注点等"
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
              disabled={isBusy}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={isBusy} type="submit">
              {isBusy && !dedupMatches ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              确认上传
            </Button>
          </div>
        </form>

        {dedupMatches ? (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-white/80 px-6 py-8 backdrop-blur-sm dark:bg-black/50">
            <ResumeDedupOverlay
              matches={dedupMatches}
              onCancel={handleDedupCancel}
              onContinue={() => void handleDedupContinue()}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
