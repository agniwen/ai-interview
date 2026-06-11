"use client";

// 「发起 AI 面试」弹窗：在简历库内直接为既有候选人触发出题 + 编辑 + 落库。
// 开弹窗时拉简历详情拿 resumeProfile，自动跑 /api/interview/generate-questions
// 把题目灌进 useInterviewForm；用户可在 InterviewQuestionsFields 内增删改，
// 「发起」时 POST /studio/resumes/:id/launch-interview，由调用方收到 round
// detail 后打开 AI 面试详情弹窗。
//
// "Launch AI interview" dialog. On open, fetches the resume detail to obtain
// the resumeProfile, then streams /api/interview/generate-questions to fill an
// editable InterviewQuestionsFields. Submitting calls launchInterviewFromResume
// and hands the returned round detail back to the parent so it can open the AI
// interview detail dialog in place.

import { useForm } from "@tanstack/react-form";
import { LoaderCircleIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SortableQuestionListEditor } from "@/components/features/studio/sortable-question-list-editor";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchStudioResume, launchInterviewFromResume } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type { InterviewQuestion, ResumeProfile } from "@arc/db-schema/interview/types";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { ResumeOverviewPanel } from "./resume-overview-panel";

interface LaunchFormValues {
  interviewQuestions: InterviewQuestion[];
}

const EMPTY_FORM_VALUES: LaunchFormValues = { interviewQuestions: [] };

// 简历库的「发起 AI 面试」只编辑题目，所以走最小化的 useForm；不要复用
// AI 面试侧的 useInterviewForm —— 它绑了 studioInterviewClientFormSchema，
// 会因为本弹窗里没有候选人姓名 / JD / 排期字段而静默 invalid 阻塞提交。
//
// We use a stripped useForm rather than useInterviewForm because the latter
// runs studioInterviewClientFormSchema which would silently fail on the
// candidate / JD / schedule fields this dialog doesn't expose.
function normalizeInterviewQuestions(values: InterviewQuestion[]): InterviewQuestion[] {
  return values.map((question, index) => ({
    ...question,
    order: index + 1,
    question: question.question.trim(),
  }));
}

interface LaunchInterviewDialogProps {
  open: boolean;
  recordId: string | null;
  candidateName: string | null;
  onOpenChange: (open: boolean) => void;
  onLaunched: (round: StudioInterviewRoundDetail) => void;
}

/**
 * 流式调 /api/interview/generate-questions，等到 result 事件取出 questions。
 * 失败时抛 Error 让调用方统一 toast。
 * Stream /api/interview/generate-questions and pluck `interviewQuestions` from
 * the terminal result event; throws on stream-side errors so the caller can
 * toast uniformly.
 */
async function streamGenerateQuestions(
  resumeProfile: ResumeProfile,
  signal: AbortSignal,
): Promise<InterviewQuestion[] | null> {
  // 用 hc 客户端调流式接口：URL 常量化 + body 类型推断走 zValidator schema；
  // body 自己 await 拿 Response 后用 readNdjsonStream 读流（rpcFetch 会消费整个 body）。
  // Streaming via hc: URL + body types come from the zValidator schema. Consume
  // the stream manually because rpcFetch would parse the whole body.
  const response = await rpc.api.interview["generate-questions"].$post(
    { json: { resumeProfile } },
    { init: { signal } },
  );
  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? "面试题生成失败");
  }

  let questions: InterviewQuestion[] | null = null;
  let streamError: string | null = null;

  await readNdjsonStream<AnalysisStreamEvent>(
    response,
    (event) => {
      if (event.type === "result") {
        const data = event.data as { interviewQuestions?: InterviewQuestion[] };
        questions = data.interviewQuestions ?? null;
      } else if (event.type === "error") {
        streamError = event.message;
      }
    },
    signal,
  );

  if (streamError) {
    throw new Error(streamError);
  }
  return questions;
}

// oxlint-disable-next-line complexity -- single dialog orchestrates fetch + stream + form + submit; splitting fragments state.
export function LaunchInterviewDialog({
  open,
  recordId,
  candidateName,
  onOpenChange,
  onLaunched,
}: LaunchInterviewDialogProps) {
  const slug = useWorkspaceSlug();
  const [isGenerating, setIsGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 简历详情：渲染「概览」和「经历」tab，也用来取 resumeProfile 触发出题。
  // Full resume detail backs the 概览/经历 tabs and seeds question generation.
  const [resumeDetail, setResumeDetail] = useState<ResumeLibraryDetail | null>(null);
  // 解析阶段没有简历 PDF 可用（手动建档）时给出可见的兜底说明。
  // Banner shown when this candidate has no resumeProfile to seed generation.
  const [noProfileNotice, setNoProfileNotice] = useState(false);
  // 默认停在「面试题」tab；用户可手动切到概览 / 经历查看候选人上下文。
  // Default to the questions tab; users can flip to overview / experience.
  const [activeTab, setActiveTab] = useState<"questions" | "overview" | "experience">("questions");
  const abortControllerRef = useRef<AbortController | null>(null);
  const onLaunchedRef = useRef(onLaunched);
  onLaunchedRef.current = onLaunched;

  const form = useForm({
    defaultValues: EMPTY_FORM_VALUES,
    onSubmit: async ({ value }) => {
      if (!recordId) {
        return;
      }
      setSubmitting(true);
      try {
        const round = await launchInterviewFromResume(
          slug,
          recordId,
          normalizeInterviewQuestions(value.interviewQuestions),
        );
        toast.success("AI 面试已发起");
        onLaunchedRef.current(round);
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发起 AI 面试失败");
      } finally {
        setSubmitting(false);
      }
    },
  });

  // 弹窗打开时一次性拉简历详情 + 流式跑出题；关闭或换 recordId 时清理。
  // Fetch resume + stream-generate questions when the dialog opens; clean up
  // on close or recordId switch.
  useEffect(() => {
    if (!(open && recordId)) {
      return;
    }
    let cancelled = false;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setNoProfileNotice(false);
    setResumeDetail(null);
    setActiveTab("questions");
    form.reset(EMPTY_FORM_VALUES);

    void (async () => {
      try {
        const detail = await fetchStudioResume(slug, recordId);
        if (cancelled || abortController.signal.aborted) {
          return;
        }
        setResumeDetail(detail);
        const profile = detail?.resumeProfile ?? null;
        if (!profile) {
          setNoProfileNotice(true);
          return;
        }

        setIsGenerating(true);
        const questions = await streamGenerateQuestions(profile, abortController.signal);
        if (cancelled || abortController.signal.aborted) {
          return;
        }
        if (questions && questions.length > 0) {
          form.setFieldValue("interviewQuestions", questions);
          toast.success("面试题已生成，可继续编辑后发起");
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        toast.error(error instanceof Error ? error.message : "面试题生成失败");
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
    // form is stable from useForm; profile fetch is keyed by open + recordId.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordId, slug]);

  const isBusy = isGenerating || submitting;

  return (
    // 与简历库详情弹窗对齐：Tabs 包住整个 Modal，TabsList 放进 headerExtra；
    // TabsContent 走 AnimatedHeight，切换时高度平滑过渡。
    // Mirror the detail dialog: Tabs wraps Modal, TabsList sits in headerExtra,
    // and AnimatedHeight gives the body a smooth height transition on switch.
    <Tabs
      key={recordId ?? "empty"}
      onValueChange={(value) => setActiveTab(value as "questions" | "overview" | "experience")}
      value={activeTab}
    >
      <Modal
        description={
          candidateName
            ? `为 ${candidateName} 生成面试题并发起 AI 面试`
            : "生成面试题并发起 AI 面试"
        }
        dismissible={!isBusy}
        headerExtra={
          // 与详情弹窗 headerExtra 结构对齐：外层 flex row 让 TabsList 在桌面
          // 端按内容自适应；不裸放 TabsList，否则 Modal 的 stack 列容器会把
          // 它拉满宽度。
          // Mirror the detail dialog's headerExtra wrapper so the desktop row
          // sizes TabsList to its content. Rendering TabsList bare inside the
          // modal's stack-mode column would stretch it to 100% width.
          <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {/* 生成面试题期间锁住所有 tab，避免用户切到「概览/经历」时面试题
                还没准备好，回来一脸空 list；overlay 已经覆盖 body，禁用 tab
                让锁定看起来一致。
                Lock all tabs during question generation so the user can't slip
                away mid-stream — the overlay already blocks the body, this
                keeps the header consistent. */}
            <TabsList className="mt-0 w-full sm:w-auto">
              <TabsTrigger
                className="flex-1 sm:min-w-[6em] sm:flex-none"
                disabled={isGenerating}
                value="questions"
              >
                面试题
              </TabsTrigger>
              <TabsTrigger
                className="flex-1 sm:min-w-[6em] sm:flex-none"
                disabled={isGenerating || !resumeDetail}
                value="overview"
              >
                概览
              </TabsTrigger>
              <TabsTrigger
                className="flex-1 sm:min-w-[6em] sm:flex-none"
                disabled={isGenerating || !resumeDetail}
                value="experience"
              >
                经历
              </TabsTrigger>
            </TabsList>
          </div>
        }
        onOpenChange={(next) => {
          if (!next && isBusy) {
            return;
          }
          onOpenChange(next);
        }}
        open={open}
        showCloseButton={!isBusy}
        size="lg"
        title="发起 AI 面试"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={isBusy} onClick={() => void form.handleSubmit()} type="button">
              {submitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              发起
            </Button>
          </div>
        }
      >
        <div className="relative">
          <AnimatedHeight>
            <TabsContent value="questions">
              {noProfileNotice ? (
                <Card className="mb-3 gap-0 rounded-md py-0">
                  <CardContent className="bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
                    该候选人没有解析过的简历，无法自动生成面试题；可在下方手动添加题目。
                  </CardContent>
                </Card>
              ) : null}
              <SortableQuestionListEditor
                arrayFieldName="interviewQuestions"
                contentFieldName="question"
                contentPlaceholder="输入面试题目"
                createItem={(sortIndex) => ({
                  difficulty: "easy",
                  order: sortIndex + 1,
                  question: "",
                })}
                disabled={isBusy}
                emptyDescription="生成完成后会自动填入，也可以手动添加。"
                emptyTitle="暂无面试题"
                form={form}
                resetKey={recordId ?? "new"}
              />
            </TabsContent>

            <TabsContent value="overview">
              {resumeDetail ? <ResumeOverviewPanel detail={resumeDetail} /> : null}
            </TabsContent>

            <TabsContent value="experience">
              <Card className="gap-0 rounded-2xl border-border bg-background py-0">
                <CardContent className="p-5">
                  <ResumeProfileView profile={resumeDetail?.resumeProfile ?? null} />
                </CardContent>
              </Card>
            </TabsContent>
          </AnimatedHeight>

          {isGenerating ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-background/85 px-6 py-8 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" />
              <p className="font-medium text-foreground text-sm">正在生成面试题…</p>
              <p className="text-muted-foreground text-xs">
                生成完成后可在下方继续编辑，再点「发起」入库。
              </p>
            </motion.div>
          ) : null}
        </div>
      </Modal>
    </Tabs>
  );
}
