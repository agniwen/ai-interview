"use client";

import type { ResumeAnalysisResult } from "@/lib/shared/interview/types";
import type { StudioInterviewRecord } from "@/lib/shared/studio-interviews";
import { useStore } from "@tanstack/react-form";
import { FileUpIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatedHeight } from "@/components/animated-height";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { ResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import { ResumeAnalysisOverlay } from "@/app/(auth)/w/[slug]/studio/_components/resume-analysis-overlay";
import { useResumeAnalysisPipeline } from "@/app/(auth)/w/[slug]/studio/_components/use-resume-analysis-pipeline";
import {
  createInterviewFormValues,
  normalizeInterviewQuestions,
  useInterviewForm,
} from "./interview-form";
import { InterviewBasicInfoFields, InterviewNotesField } from "./interview-form/basic-info-fields";
import { buildInterviewFormData } from "./interview-form/build-form-data";
import { InterviewQuestionsFields } from "./interview-questions-fields";
import { InterviewScheduleFields } from "./interview-schedule-fields";

function resolveQuestionsTabSuffix(questionCount: number) {
  if (questionCount > 0) {
    return ` (${questionCount})`;
  }
  return "";
}

type ResumeSummary = Pick<ResumeAnalysisResult, "fileName" | "resumeProfile">;

// oxlint-disable-next-line complexity -- Create dialog owns form, upload, schedule, and interview-questions flows together; extracting pieces fragments state.
export function CreateInterviewDialog({
  onCreated,
}: {
  onCreated: (record: StudioInterviewRecord) => void;
}) {
  const slug = useWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("basic");

  // onSubmit / onSubmitInvalid 在 form 创建时捕获闭包，但 pipeline / resetDialog
  // 此时尚未声明。用 ref 桥接：各变量声明后立即写入对应 ref，回调通过 ref
  // 读取最新值，规避 no-use-before-define 的静态分析限制。
  // onSubmit / onSubmitInvalid are captured when the form is created, before
  // pipeline and resetDialog are declared. Refs bridge the gap: each variable
  // writes into its ref right after declaration, and the callbacks read through
  // the ref at call time, sidestepping the no-use-before-define static check.
  const pipelineRef = useRef<ResumeAnalysisPipeline | null>(null);
  const resetDialogRef = useRef<(() => void) | null>(null);

  const form = useInterviewForm({
    defaultValues: createInterviewFormValues(),
    onSubmit: async (values) => {
      // 通用字段 + 简历由共享 helper 组装；问题字段需要二选一处理（带 LLM 解析时附 resumePayload，
      // 否则附 manualInterviewQuestions），所以走自定义分支。
      // Common fields + resume go through the shared helper; the question payload is
      // either `resumePayload` (LLM-analysed) or `manualInterviewQuestions`, so it
      // gets a custom branch.
      const p = pipelineRef.current;
      const normalizedQuestions = normalizeInterviewQuestions(values.interviewQuestions);
      const formData = buildInterviewFormData(values, {
        questionsFieldName: null,
        resumeFile: p?.resumeFile ?? null,
      });

      if (p?.resumePayload) {
        formData.append(
          "resumePayload",
          JSON.stringify({
            fileName: p.resumePayload.fileName,
            interviewQuestions: normalizedQuestions,
            resumeProfile: p.resumePayload.resumeProfile,
          } satisfies ResumeAnalysisResult),
        );
      } else if (normalizedQuestions.length > 0) {
        formData.append("manualInterviewQuestions", JSON.stringify(normalizedQuestions));
      }

      try {
        const created = await apiFetch<StudioInterviewRecord>(`/api/w/${slug}/studio/interviews`, {
          body: formData,
          method: "POST",
        });
        onCreated(created);
        setOpen(false);
        resetDialogRef.current?.();
        form.reset(createInterviewFormValues());
        toast.success("面试记录已创建");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "创建失败");
      }
    },
    onSubmitInvalid: (fieldMeta) => {
      const hasQuestionError = Object.entries(fieldMeta).some(
        ([key, value]) =>
          key.startsWith("interviewQuestions") &&
          ((value as { errors?: unknown[] })?.errors?.length ?? 0) > 0,
      );
      if (hasQuestionError) {
        setActiveTab("questions");
      }
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
      // 上传新简历时清空旧题目，等 Step 2 生成完毕再回填。
      // Clear stale questions when a new file is uploaded; Step 2 will repopulate.
      form.setFieldValue("interviewQuestions", []);
    },
    onQuestionsGenerated: (questions) => {
      form.setFieldValue("interviewQuestions", questions);
    },
  });

  // pipeline ref を onSubmit 内で読み取れるよう毎レンダーに同期する。
  // Sync the ref on every render so onSubmit always reads the latest pipeline.
  pipelineRef.current = pipeline;

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const questionCount = useStore(form.store, (state) => state.values.interviewQuestions.length);

  // 清空 dialog 内除表单之外的所有临时态：调用 pipeline.reset() 处理 abort + 流程状态，
  // 再重置文件 input 的 DOM value 和活动 tab。表单字段由调用方紧随其后用
  // form.reset(createInterviewFormValues()) 重置。
  // Reset all transient dialog state except the form. pipeline.reset() handles
  // abort + pipeline state; this also resets the file input DOM and active tab.
  const resetDialog = useCallback(() => {
    pipeline.reset();
    setActiveTab("basic");
    const fileInput = document.querySelector("#resume-upload") as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  }, [pipeline]);

  // resetDialog ref を onSubmit 内で読み取れるよう毎レンダーに同期する。
  // Sync the ref on every render so onSubmit always calls the latest resetDialog.
  resetDialogRef.current = resetDialog;

  // resumePayload 是简历分析完成后用于展示徽章的摘要数据。
  // resumePayload is the summary used to render the "已完成简历分析" badge.
  const resumePayload = pipeline.resumePayload as ResumeSummary | null;

  return (
    <>
      <Button className="w-full sm:w-auto" onClick={() => setOpen(true)} type="button">
        <FileUpIcon className="size-4" />
        新建面试记录
      </Button>
      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <Modal
          open={open}
          onOpenChange={(value) => {
            if (pipeline.isBusy) {
              return;
            }
            setOpen(value);
            if (!value) {
              resetDialog();
              form.reset(createInterviewFormValues());
            }
          }}
          title="新建面试记录"
          description="支持手动录入候选人资料，也可以先上传 PDF 简历自动分析并回填表单。"
          size="2xl"
          dismissible={!pipeline.isBusy}
          showCloseButton={!pipeline.isBusy}
          headerExtra={
            <TabsList className="mt-2">
              <TabsTrigger className="min-w-[8em]" value="basic">
                基础信息
              </TabsTrigger>
              <TabsTrigger className="min-w-[8em]" value="questions">
                面试题目
                {resolveQuestionsTabSuffix(questionCount)}
              </TabsTrigger>
            </TabsList>
          }
          footer={
            <Button
              disabled={isSubmitting || pipeline.isBusy}
              form="create-interview-form"
              type="submit"
            >
              {isSubmitting || pipeline.isBusy ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : null}
              保存面试记录
            </Button>
          }
        >
          <form
            id="create-interview-form"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <AnimatedHeight>
              <TabsContent className="mt-0" value="basic">
                <div className="space-y-5">
                  <div className="grid gap-4">
                    <FieldGroup className="gap-2">
                      <FieldLabel htmlFor="resume-upload">简历 PDF</FieldLabel>
                      <Input
                        accept="application/pdf"
                        disabled={pipeline.isAnalyzingResume || isSubmitting}
                        id="resume-upload"
                        onChange={(event) =>
                          void pipeline.handleResumeChange(event.target.files?.[0] ?? null)
                        }
                        type="file"
                      />
                      <p className="text-muted-foreground text-sm">
                        选填。上传后会调用现有简历分析接口，自动回填候选人姓名、岗位和题目数据。
                      </p>
                      {pipeline.resumeFile ? (
                        <p className="break-all text-muted-foreground text-sm">
                          {pipeline.resumeFile.name}
                        </p>
                      ) : null}
                      {resumePayload ? (
                        <div className="rounded-xl border border-border/60 bg-background/80 px-4 py-3 text-sm">
                          <p className="flex items-center gap-2 font-medium">
                            <SparklesIcon className="size-4 text-amber-500" />
                            已完成简历分析
                          </p>
                          <p className="mt-1 break-words text-muted-foreground leading-normal">
                            {resumePayload.resumeProfile.name}
                            {" · "}
                            {resumePayload.resumeProfile.targetRoles[0] ?? "待识别岗位"}
                            {" · "}
                            {questionCount} 道题
                          </p>
                        </div>
                      ) : null}
                    </FieldGroup>
                  </div>

                  <InterviewBasicInfoFields form={form} />

                  <InterviewScheduleFields form={form} />

                  <InterviewNotesField form={form} />
                </div>
              </TabsContent>

              <TabsContent className="mt-0" value="questions">
                <InterviewQuestionsFields
                  disabled={
                    isSubmitting || pipeline.isAnalyzingResume || pipeline.isGeneratingQuestions
                  }
                  form={form}
                  resetKey={open ? "create-open" : "create-closed"}
                />
              </TabsContent>
            </AnimatedHeight>

            <ResumeAnalysisOverlay pipeline={pipeline} />
          </form>
        </Modal>
      </Tabs>
    </>
  );
}
