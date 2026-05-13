"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useStore, useForm } from "@tanstack/react-form";
import { LoaderCircleIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CandidateFormFields } from "@/components/candidate-form-fields";
import { ResumeDedupOverlay } from "@/components/resume-dedup-overlay";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { DedupMatchRecord } from "@/lib/client/api";
import { apiFetch, fetchResumeDedup } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";

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
          <CandidateFormFields
            disabled={isBusy}
            form={form}
            onResumeFileChange={setResumeFile}
            resumeFile={resumeFile}
          />

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
