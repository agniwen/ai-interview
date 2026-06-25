"use client";

// 「新建简历记录」对话框。接入 useResumeAnalysisPipeline 自动解析简历 / 匹配 JD /
// 出题；footer 双按钮：仅保存 (POST /studio/resumes) 或保存并发起面试
// (POST /studio/interviews，附默认 1 条 schedule 行)。
//
// "Create resume record" dialog. Wires the shared analysis pipeline and offers
// two submit paths: save-only (resume library) or save-and-start (kicks off a
// 1-round interview with default schedule).

import { useForm, useStore } from "@tanstack/react-form";
import { LoaderCircleIcon } from "@/components/icons/hugeicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ResumeAnalysisOverlay } from "@/components/features/studio/resume-analysis-overlay";
import { useResumeAnalysisPipeline } from "@/components/features/studio/use-resume-analysis-pipeline";
import type { ResumeAnalysisPipeline } from "@/components/features/studio/use-resume-analysis-pipeline";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { CandidateFormFields } from "@/components/features/candidate/candidate-form-fields";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, extractResumeDedupConflictMatches } from "@/lib/client/api";
import {
  buildSaveAndStartResumeFormData,
  buildSaveOnlyResumeFormData,
} from "@/lib/client/resume-analysis";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import { createResumeLibraryFormValues, resumeLibraryFormSchema } from "@arc/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { MAX_BULK_BATCH_SIZE } from "@arc/shared/bulk-resume-upload";

export type CreateResumeRecordResult =
  | { mode: "save-only"; detail: ResumeLibraryDetail }
  | { mode: "save-and-start"; round: StudioInterviewRoundDetail };

type SubmitMode = "save-only" | "save-and-start";

interface CreateResumeRecordDialogProps {
  initialFile?: File | null;
  open: boolean;
  onCreated: (result: CreateResumeRecordResult) => void;
  onMultipleFilesPicked?: (files: File[]) => void;
  onOpenChange: (open: boolean) => void;
}

function getFormErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && "message" in error) {
    const { message } = error as { message?: unknown };
    return typeof message === "string" ? message : null;
  }
  return null;
}

function getFirstResumeFormErrorMessage(meta: Record<string, { errors?: unknown[] }>) {
  const fieldOrder = [
    "jobDescriptionId",
    "candidateName",
    "candidateEmail",
    "candidatePhone",
    "targetRole",
    "notes",
  ];
  for (const field of fieldOrder) {
    const message = getFormErrorMessage(meta[field]?.errors?.[0]);
    if (message) {
      return message;
    }
  }
  return "请检查简历信息后再保存";
}

export function CreateResumeRecordDialog({
  initialFile = null,
  open,
  onCreated,
  onMultipleFilesPicked,
  onOpenChange,
}: CreateResumeRecordDialogProps) {
  const slug = useWorkspaceSlug();
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "experience">("basic");
  const submitModeRef = useRef<SubmitMode>("save-only");
  const initialFileRef = useRef<File | null>(null);
  // onSubmit 闭包早于 pipeline 声明捕获，用 ref 桥接以读取最新值。
  // The onSubmit closure captures before pipeline is declared; a ref bridges
  // the forward reference so the latest pipeline is readable at call time.
  const pipelineRef = useRef<ResumeAnalysisPipeline | null>(null);

  const form = useForm({
    defaultValues: createResumeLibraryFormValues(),
    onSubmit: async ({ value }) => {
      const mode = submitModeRef.current;
      const p = pipelineRef.current;
      const file = p?.resumeFile ?? null;
      let payload = p?.resumePayload ?? null;
      const resumeReview = p?.resumeReview ?? null;

      setSubmitting(true);
      try {
        const dedupPolicy = p?.dedupConfirmed ? "force" : "check";
        if (mode === "save-only") {
          const detail = await apiFetch<ResumeLibraryDetail>(`/api/w/${slug}/studio/resumes`, {
            body: buildSaveOnlyResumeFormData(value, file, payload, {
              dedupPolicy,
              resumeReview,
            }),
            method: "POST",
          });
          toast.success("简历记录已创建");
          onCreated({ detail, mode: "save-only" });
        } else {
          // 「保存并发起面试」时按需生成面试题：解析阶段不再自动出题，所以在
          // POST 之前先调一次 generateQuestions —— pipeline.isGeneratingQuestions
          // 会让既有的 ResumeAnalysisOverlay 自动展示「正在生成面试题」遮罩。
          // Question generation is on-demand: parse no longer auto-chains, so we
          // call generateQuestions here before POST. The shared overlay shows
          // the loading state via pipeline.isGeneratingQuestions.
          if (p && payload && payload.interviewQuestions.length === 0) {
            const updated = await p.generateQuestions();
            if (updated) {
              payload = updated;
            }
          }

          const round = await apiFetch<StudioInterviewRoundDetail>(
            `/api/w/${slug}/studio/interviews`,
            {
              body: buildSaveAndStartResumeFormData(value, file, payload, {
                dedupPolicy,
                resumeReview,
              }),
              method: "POST",
            },
          );
          toast.success("已创建并发起 1 轮面试");
          onCreated({ mode: "save-and-start", round });
        }
        onOpenChange(false);
        form.reset(createResumeLibraryFormValues());
        p?.reset();
      } catch (error) {
        const dedupMatches = extractResumeDedupConflictMatches(error);
        if (dedupMatches) {
          p?.handleDedupConflict(dedupMatches);
          toast.info("检测到疑似重复候选人，请确认是否继续创建");
          return;
        }
        toast.error(error instanceof Error ? error.message : "提交失败");
      } finally {
        setSubmitting(false);
      }
    },
    onSubmitInvalid: ({ formApi }) => {
      const meta = formApi.store.state.fieldMeta as Record<string, { errors?: unknown[] }>;
      setActiveTab("basic");
      toast.error(getFirstResumeFormErrorMessage(meta));
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
    // JD 匹配完后 pipeline 会基于（候选人 + 匹配岗位）生成简历评价，并流式回填到「简历评价」字段。
    // 生成期间外层遮罩会阻止编辑，最终 result 再覆盖一次，保证编辑器里拿到完整文本。
    // The review is streamed into notes while the analysis overlay blocks
    // editing, then the final result overwrites it once to guarantee a complete
    // editor value.
    onReviewDraftChange: (review) => {
      form.setFieldValue("notes", review);
    },
    onReviewGenerated: (result) => {
      form.setFieldValue("notes", result.review);
    },
  });
  // 把最新 pipeline 写入 ref，供 form.onSubmit 闭包读取。
  // Sync the latest pipeline into the ref so form.onSubmit can read it.
  pipelineRef.current = pipeline;

  useEffect(() => {
    if (!open) {
      initialFileRef.current = null;
      return;
    }
    if (!initialFile || initialFileRef.current === initialFile) {
      return;
    }

    initialFileRef.current = initialFile;
    setActiveTab("basic");
    void pipeline.handleResumeChange(initialFile);
  }, [initialFile, open, pipeline]);

  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  const jobDescriptionId = useStore(form.store, (s) => s.values.jobDescriptionId);
  const isBusy = submitting || isSubmitting || pipeline.isBusy;
  // 新建场景里简历 PDF 必填，且解析完成前不允许保存，强制走解析-回填-提交流程。
  // PDF is required in the create flow, and saving stays disabled until parsing
  // finishes so the record is created from structured resume data.
  const { resumeFile, resumePayload } = pipeline;
  const hasResumeFile = resumeFile !== null;
  const hasParsedResume = resumePayload !== null;
  const canSaveOnly = hasResumeFile && hasParsedResume;
  const canSaveAndStart = jobDescriptionId.trim().length > 0 && canSaveOnly;

  // "保存并发起面试" 按钮的禁用提示文案：未传简历 / 未选 JD / 可点 三种状态。
  // 拆成纯函数避免嵌套三元，oxlint 不允许 nested ternary。
  // Tooltip text for the save-and-start button across the three disabled
  // states (no resume / no JD / ready). Flattened to avoid nested ternaries.
  let saveAndStartHint: string | undefined;
  if (!hasResumeFile) {
    saveAndStartHint = "请先上传简历文件";
  } else if (!hasParsedResume) {
    saveAndStartHint = "请等待简历解析完成";
  } else if (!canSaveAndStart) {
    saveAndStartHint = "请先选择在招岗位";
  }

  const triggerSubmit = useCallback(
    (mode: SubmitMode) => {
      submitModeRef.current = mode;
      void form.handleSubmit();
    },
    [form],
  );

  const handleMultipleFilesPicked = useCallback(
    (files: File[]) => {
      pipeline.reset();
      form.reset(createResumeLibraryFormValues());
      setActiveTab("basic");
      onOpenChange(false);
      onMultipleFilesPicked?.(files);
    },
    [form, onMultipleFilesPicked, onOpenChange, pipeline],
  );

  return (
    <Modal
      description="上传简历文件自动解析候选人信息、匹配岗位并生成面试题；可仅入库，或一键发起 AI 面试。"
      dismissible={!isBusy}
      onOpenChange={(next) => {
        if (!next && isBusy) {
          return;
        }
        if (!next) {
          pipeline.reset();
          form.reset(createResumeLibraryFormValues());
          setActiveTab("basic");
        }
        onOpenChange(next);
      }}
      open={open}
      showCloseButton={!isBusy}
      size={hasParsedResume ? "xl" : "md"}
      title="新建简历记录"
      footer={
        <>
          <Button
            disabled={isBusy || !canSaveOnly}
            onClick={() => triggerSubmit("save-only")}
            title={canSaveOnly ? undefined : "请先上传并完成简历解析"}
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
            title={saveAndStartHint}
            type="button"
          >
            {isBusy && submitModeRef.current === "save-and-start" ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : null}
            保存并发起面试
          </Button>
        </>
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
        <AnimatedHeight>
          {hasParsedResume ? (
            <Tabs
              onValueChange={(value) => setActiveTab(value as "basic" | "experience")}
              value={activeTab}
            >
              <TabsList>
                <TabsTrigger className="min-w-[8em]" value="basic">
                  基本信息
                </TabsTrigger>
                <TabsTrigger className="min-w-[8em]" value="experience">
                  经历
                </TabsTrigger>
              </TabsList>

              <TabsContent className="mt-4" value="basic">
                <CandidateFormFields
                  disabled={isBusy}
                  form={form}
                  isJobDescriptionMatching={pipeline.isMatchingJobDescription}
                  onResumeFileChange={(file) => {
                    setActiveTab("basic");
                    void pipeline.handleResumeChange(file);
                  }}
                  onResumeFilesChange={handleMultipleFilesPicked}
                  requireResumeFile
                  resumeFile={resumeFile}
                  resumeFileMaxFiles={MAX_BULK_BATCH_SIZE}
                  resumeFileMultiple
                  resumeFilePlaceholder="请选择简历文件"
                />
              </TabsContent>

              <TabsContent className="mt-4" value="experience">
                <ResumeProfileView profile={resumePayload.resumeProfile} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="pt-1">
              <CandidateFormFields
                disabled={isBusy}
                form={form}
                isJobDescriptionMatching={pipeline.isMatchingJobDescription}
                onResumeFileChange={(file) => {
                  setActiveTab("basic");
                  void pipeline.handleResumeChange(file);
                }}
                onResumeFilesChange={handleMultipleFilesPicked}
                requireResumeFile
                resumeFile={resumeFile}
                resumeFileMaxFiles={MAX_BULK_BATCH_SIZE}
                resumeFileMultiple
                resumeFilePlaceholder="请选择简历文件"
                showDetails={false}
              />
            </div>
          )}
        </AnimatedHeight>
      </form>

      <ResumeAnalysisOverlay pipeline={pipeline} />
    </Modal>
  );
}
