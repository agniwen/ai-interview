"use client";

import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useStore, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CandidateFormFields } from "@/components/candidate-form-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { apiFetch, fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";

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
        <CandidateFormFields
          disabled={isSubmitting}
          existingResumeFileName={query.data?.resumeFileName ?? null}
          form={form}
          onResumeFileChange={setResumeFile}
          resumeFile={resumeFile}
          resumeFilePlaceholder="未上传 PDF，点击选择文件"
        />

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
