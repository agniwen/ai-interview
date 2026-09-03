"use client";

import type {
  CandidateInterviewFeedback,
  CandidateInterviewFeedbackCategory,
  CandidateInterviewFeedbackInput,
} from "@app/db-schema/studio-interviews";
import {
  candidateInterviewFeedbackCategoryMeta,
  candidateInterviewFeedbackCategoryValues,
  candidateInterviewFeedbackInputSchema,
} from "@app/db-schema/studio-interviews";
import { cn } from "@app/shared/utils";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronRight,
  IconCircleCheck,
  IconMessageCircle,
} from "@tabler/icons-react";
import { useState } from "react";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function CandidateInterviewFeedbackContent({
  feedback,
}: {
  feedback: CandidateInterviewFeedback;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {feedback.categories.map((category) => (
          <Badge key={category} variant="outline">
            {candidateInterviewFeedbackCategoryMeta[category].label}
          </Badge>
        ))}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6">{feedback.detail}</p>
      <p className="text-muted-foreground text-xs">
        提交于 <LocalDateTimeText format="long-zh" value={feedback.submittedAt} />
      </p>
    </div>
  );
}

export function CandidateInterviewFeedbackPanel({
  feedback,
  onSubmit,
}: {
  feedback: CandidateInterviewFeedback | null;
  onSubmit: (input: CandidateInterviewFeedbackInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [categories, setCategories] = useState<CandidateInterviewFeedbackCategory[]>([]);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  if (feedback) {
    return (
      <div className="flex flex-col gap-4">
        <Separator />
        <Item className="items-start p-1">
          <ItemMedia>
            <IconCircleCheck className="size-5 text-muted-foreground" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>感谢您的反馈</ItemTitle>
            <ItemDescription>本轮反馈已为您记录，感谢您的说明。</ItemDescription>
            <div className="mt-3">
              <CandidateInterviewFeedbackContent feedback={feedback} />
            </div>
          </ItemContent>
        </Item>
      </div>
    );
  }

  const input = { categories, detail };
  const validation = candidateInterviewFeedbackInputSchema.safeParse(input);

  function toggleCategory(category: CandidateInterviewFeedbackCategory, checked: boolean) {
    setCategories((current) =>
      checked ? [...current, category] : current.filter((value) => value !== category),
    );
    setError(null);
  }

  function requestConfirmation() {
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "请完整填写反馈内容。");
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setIsDrawerExpanded(false);
    }
  }

  async function confirmSubmission() {
    const parsed = candidateInterviewFeedbackInputSchema.safeParse(input);
    if (!parsed.success) {
      setConfirmOpen(false);
      setError(parsed.error.issues[0]?.message ?? "请完整填写反馈内容。");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(parsed.data);
      setConfirmOpen(false);
      setOpen(false);
    } catch (submissionError) {
      setConfirmOpen(false);
      setError(
        submissionError instanceof Error ? submissionError.message : "提交反馈失败，请重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <Separator />
        <Item className="items-start p-1">
          <ItemMedia className="hidden md:flex">
            <IconMessageCircle className="size-5 text-muted-foreground" />
          </ItemMedia>
          <ItemContent className="order-2 basis-full md:order-none md:basis-auto">
            <ItemTitle className="hidden md:flex">面试过程不太顺利？</ItemTitle>
            <ItemDescription>如遇音视频、网络或 AI 对话问题，可以告诉我们。</ItemDescription>
          </ItemContent>
          <ItemActions className="order-1 basis-full md:order-none md:basis-auto md:self-center">
            <Button
              className="w-full md:h-8 md:w-auto md:gap-1.5 md:px-3 md:has-[>svg]:px-2.5"
              onClick={() => setOpen(true)}
              size="lg"
              type="button"
              variant="secondary"
            >
              反馈问题
              <IconChevronRight data-icon="inline-end" />
            </Button>
          </ItemActions>
        </Item>
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent
          className={cn(
            "md:max-w-xl",
            isDrawerExpanded && "max-md:mt-0 max-md:h-dvh max-md:max-h-dvh max-md:rounded-none",
          )}
        >
          <DialogHeader className="relative pr-10">
            <DialogTitle>反馈面试问题</DialogTitle>
            <DialogDescription>请选择问题分类，并描述本轮 AI 面试中遇到的情况。</DialogDescription>
            <Button
              aria-expanded={isDrawerExpanded}
              aria-label={isDrawerExpanded ? "收起反馈面板" : "全屏展开反馈面板"}
              className="absolute top-0 right-0 md:hidden"
              onClick={() => setIsDrawerExpanded((current) => !current)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {isDrawerExpanded ? (
                <IconArrowsMinimize data-icon="inline-start" />
              ) : (
                <IconArrowsMaximize data-icon="inline-start" />
              )}
            </Button>
          </DialogHeader>
          <div className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="font-medium text-sm">问题分类（可多选）</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {candidateInterviewFeedbackCategoryValues.map((category) => {
                  const checked = categories.includes(category);
                  const id = `candidate-feedback-${category}`;
                  return (
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm"
                      htmlFor={id}
                      key={category}
                    >
                      <Checkbox
                        checked={checked}
                        id={id}
                        onCheckedChange={(value) => toggleCategory(category, value === true)}
                      />
                      {candidateInterviewFeedbackCategoryMeta[category].label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="candidate-feedback-detail">详细描述</Label>
                <span className="text-muted-foreground text-xs">{detail.length}/2000</span>
              </div>
              <Textarea
                id="candidate-feedback-detail"
                maxLength={2000}
                onChange={(event) => {
                  setDetail(event.target.value);
                  setError(null);
                }}
                placeholder="请描述问题发生的时间、表现，以及是否影响您继续面试……"
                rows={6}
                value={detail}
              />
              <p className="text-muted-foreground text-xs">请填写 10–2000 个字。</p>
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
              取消
            </Button>
            <Button onClick={requestConfirmation} type="button">
              下一步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认提交反馈？</AlertDialogTitle>
            <AlertDialogDescription>
              每轮 AI 面试只能提交一次，提交后无法修改。请确认内容无误后继续。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>返回修改</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => {
                confirmSubmission();
              }}
            >
              {isSubmitting ? "提交中..." : "确认提交"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
