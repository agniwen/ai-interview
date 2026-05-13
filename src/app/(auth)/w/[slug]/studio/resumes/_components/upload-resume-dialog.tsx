"use client";

// 「新建简历记录」对话框。接入 useResumeAnalysisPipeline 自动解析简历 / 匹配 JD /
// 出题；footer 双按钮：仅保存 (POST /studio/resumes) 或保存并发起面试
// (POST /studio/interviews，附默认 1 条 schedule 行)。
//
// "Create resume record" dialog. Wires the shared analysis pipeline and offers
// two submit paths: save-only (resume library) or save-and-start (kicks off a
// 1-round interview with default schedule).

import { useForm, useStore } from "@tanstack/react-form";
import { FileUpIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ResumeAnalysisOverlay } from "@/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay";
import { useResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import type { ResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import { CandidateFormFields } from "@/components/candidate-form-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { ResumeAnalysisResult } from "@/lib/shared/interview/types";
import { createDefaultScheduleEntry } from "@/lib/shared/studio-interviews";
import type { StudioInterviewRecord } from "@/lib/shared/studio-interviews";
import {
  createResumeLibraryFormValues,
  resumeLibraryFormSchema,
} from "@/lib/shared/studio-resumes";
import type { ResumeLibraryDetail, ResumeLibraryFormValues } from "@/lib/shared/studio-resumes";

export type CreateResumeRecordResult =
  | { mode: "save-only"; detail: ResumeLibraryDetail }
  | { mode: "save-and-start"; record: StudioInterviewRecord };

type SubmitMode = "save-only" | "save-and-start";

interface CreateResumeRecordDialogProps {
  onCreated: (result: CreateResumeRecordResult) => void;
}

// 将公共候选人字段追加到 FormData。
// Append the common candidate fields to a FormData object.
function appendCandidateFields(fd: FormData, value: ResumeLibraryFormValues) {
  fd.append("candidateName", value.candidateName);
  fd.append("candidateEmail", value.candidateEmail);
  fd.append("candidatePhone", value.candidatePhone);
  fd.append("targetRole", value.targetRole);
  fd.append("jobDescriptionId", value.jobDescriptionId);
  fd.append("notes", value.notes);
}

// 组装「仅保存」请求体。
// Build the FormData payload for the save-only path.
function buildSaveOnlyFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
): FormData {
  const fd = new FormData();
  appendCandidateFields(fd, value);
  if (file) {
    fd.append("resume", file);
  }
  if (resumePayload) {
    fd.append("resumePayload", JSON.stringify(resumePayload));
  }
  return fd;
}

// 组装「保存并发起面试」请求体：额外附 status=ready 和默认 1 轮排期。
// Build the FormData payload for the save-and-start path: adds status=ready and
// a single default schedule entry.
function buildSaveAndStartFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
): FormData {
  const fd = new FormData();
  appendCandidateFields(fd, value);
  fd.append("status", "ready");
  fd.append("scheduleEntries", JSON.stringify([createDefaultScheduleEntry()]));
  if (file) {
    fd.append("resume", file);
  }
  if (resumePayload) {
    fd.append("resumePayload", JSON.stringify(resumePayload));
  }
  return fd;
}

export function CreateResumeRecordDialog({ onCreated }: CreateResumeRecordDialogProps) {
  const slug = useWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitModeRef = useRef<SubmitMode>("save-only");
  // 同 CreateInterviewDialog：onSubmit 闭包早于 pipeline 声明捕获，用 ref 桥接。
  // Same pattern as CreateInterviewDialog: onSubmit closure captures before
  // pipeline is declared; a ref bridges the forward reference.
  const pipelineRef = useRef<ResumeAnalysisPipeline | null>(null);

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      const mode = submitModeRef.current;
      const p = pipelineRef.current;
      const file = p?.resumeFile ?? null;
      const payload = p?.resumePayload ?? null;

      setSubmitting(true);
      try {
        if (mode === "save-only") {
          const detail = await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes`, {
            body: buildSaveOnlyFormData(value, file, payload),
            method: "POST",
          });
          toast.success("简历记录已创建");
          onCreated({ detail, mode: "save-only" });
        } else {
          const record = await apiFetch<StudioInterviewRecord>(`/api/w/${slug}/studio/interviews`, {
            body: buildSaveAndStartFormData(value, file, payload),
            method: "POST",
          });
          toast.success("已创建并发起 1 轮面试");
          onCreated({ mode: "save-and-start", record });
        }
        setOpen(false);
        form.reset(createResumeLibraryFormValues());
        p?.reset();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "提交失败");
      } finally {
        setSubmitting(false);
      }
    },
    validators: {
      onSubmit: resumeLibraryFormSchema,
    },
  });

  const pipeline = useResumeAnalysisPipeline({
    onJobDescriptionMatched: (matchedId) => {
      form.setFieldValue("jobDescriptionId", matchedId);
    },
    onProfileParsed: ({ resumeProfile }) => {
      form.setFieldValue("candidateName", resumeProfile.name);
      form.setFieldValue("candidateEmail", resumeProfile.email ?? "");
      form.setFieldValue("candidatePhone", resumeProfile.phone ?? "");
      form.setFieldValue("targetRole", resumeProfile.targetRoles[0] ?? "");
    },
    onQuestionsGenerated: () => {
      // resumePayload 由 hook 内部维护，弹窗不展示题目，故不需写入表单。
      // resumePayload is managed inside the hook; the dialog has no questions UI.
    },
  });
  // 把最新 pipeline 写入 ref，供 form.onSubmit 闭包读取。
  // Sync the latest pipeline into the ref so form.onSubmit can read it.
  pipelineRef.current = pipeline;

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  const jobDescriptionId = useStore(form.store, (s) => s.values.jobDescriptionId);
  const isBusy = submitting || isSubmitting || pipeline.isBusy;
  const canSaveAndStart = jobDescriptionId.trim().length > 0;

  const triggerSubmit = useCallback(
    (mode: SubmitMode) => {
      submitModeRef.current = mode;
      void form.handleSubmit();
    },
    [form],
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <FileUpIcon className="size-4" />
        新建简历记录
      </Button>

      <Modal
        description="上传 PDF 自动解析候选人信息、匹配岗位并生成面试题；可仅入库，或一键发起 AI 面试。"
        dismissible={!isBusy}
        onOpenChange={(next) => {
          if (!next && isBusy) {
            return;
          }
          if (!next) {
            pipeline.reset();
            form.reset(createResumeLibraryFormValues());
          }
          setOpen(next);
        }}
        open={open}
        showCloseButton={!isBusy}
        size="md"
        title="新建简历记录"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={isBusy}
              onClick={() => triggerSubmit("save-only")}
              type="button"
              variant="outline"
            >
              {isBusy && submitModeRef.current === "save-only" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存
            </Button>
            <Button
              disabled={isBusy || !canSaveAndStart}
              onClick={() => triggerSubmit("save-and-start")}
              title={canSaveAndStart ? undefined : "请先选择在招岗位"}
              type="button"
            >
              {isBusy && submitModeRef.current === "save-and-start" ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存并发起面试
            </Button>
          </div>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            // Footer buttons drive submit explicitly; suppress native form submit.
            // 外层 footer 按钮触发提交，禁用原生 form 默认行为。
            e.preventDefault();
          }}
        >
          <CandidateFormFields
            disabled={isBusy}
            form={form}
            onResumeFileChange={(file) => void pipeline.handleResumeChange(file)}
            resumeFile={pipeline.resumeFile}
          />
        </form>

        <ResumeAnalysisOverlay pipeline={pipeline} />
      </Modal>
    </>
  );
}
