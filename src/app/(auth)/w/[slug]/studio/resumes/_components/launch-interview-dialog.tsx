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
import { SortableQuestionListEditor } from "@/app/(auth)/w/[slug]/studio/_components/sortable-question-list-editor";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fetchStudioResume, launchInterviewFromResume } from "@/lib/client/api";
import { readNdjsonStream } from "@/lib/client/ndjson-stream";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { AnalysisStreamEvent } from "@/lib/shared/api-stream";
import type { InterviewQuestion, ResumeProfile } from "@/lib/shared/interview/types";
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";

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
  const response = await fetch("/api/interview/generate-questions", {
    body: JSON.stringify({ resumeProfile }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
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
  // 解析阶段没有简历 PDF 可用（手动建档）时给出可见的兜底说明。
  // Banner shown when this candidate has no resumeProfile to seed generation.
  const [noProfileNotice, setNoProfileNotice] = useState(false);
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
    form.reset(EMPTY_FORM_VALUES);

    void (async () => {
      try {
        const detail = await fetchStudioResume(slug, recordId);
        if (cancelled || abortController.signal.aborted) {
          return;
        }
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
    <Modal
      description={
        candidateName ? `为 ${candidateName} 生成面试题并发起 AI 面试` : "生成面试题并发起 AI 面试"
      }
      dismissible={!isBusy}
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
        {noProfileNotice ? (
          <p className="mb-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
            该候选人没有解析过的简历，无法自动生成面试题；可在下方手动添加题目。
          </p>
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
  );
}
