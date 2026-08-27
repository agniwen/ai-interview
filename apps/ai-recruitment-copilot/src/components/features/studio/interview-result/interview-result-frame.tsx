"use client";

import { IconCopy, IconListDetails } from "@tabler/icons-react";
import { useState } from "react";

import { CandidateInterviewFeedbackContent } from "@/components/features/interview/candidate-interview-feedback";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { TimeDisplay } from "@/components/features/display/time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { cn } from "@arc/shared/utils";

import { copyInterviewLink } from "../interviews/interview-link-actions";
import { resolveAiInterviewLinkState } from "../interviews/ai-interview-link-state";
import {
  formatReportStatus,
  getReportBadgeVariant,
  resolveRecommendationVariant,
} from "../interviews/interview-detail/helpers";
import { SummaryMetric } from "../studio-person-detail-skeletons";
import { compactText } from "../studio-person-detail-sections";
import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";
import { RecommendedQuestionsDialog } from "./recommended-questions-dialog";

type InterviewResultRecord = NonNullable<StudioPersonDetailViewModel["record"]>;

function InterviewResultActionRow({ record }: { record: InterviewResultRecord }) {
  const [recommendedQuestionsOpen, setRecommendedQuestionsOpen] = useState(false);
  const recommendedQuestions = record.interviewQuestions ?? [];
  const hasRecommendedQuestions = recommendedQuestions.length > 0;
  const showCopyInterviewLink = import.meta.env.DEV || record.roundStatus === "pending";
  const interviewLinkState = record.roundStatus
    ? resolveAiInterviewLinkState({
        candidateInviteExpiresAt: record.roundCandidateInviteExpiresAt ?? null,
        status: record.roundStatus,
      })
    : null;

  if (!(hasRecommendedQuestions || showCopyInterviewLink)) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "mt-5 grid gap-2 border-border/50 border-t pt-5",
          hasRecommendedQuestions && showCopyInterviewLink
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1",
        )}
      >
        {hasRecommendedQuestions ? (
          <Button
            className="w-full"
            onClick={() => setRecommendedQuestionsOpen(true)}
            type="button"
            variant="outline"
          >
            <IconListDetails className="size-4" />
            查看推荐问题
          </Button>
        ) : null}
        {showCopyInterviewLink ? (
          <Button
            className="w-full"
            disabled={!record.roundInterviewLink || interviewLinkState?.copyDisabled}
            onClick={() => {
              if (record.roundInterviewLink && record.roundStatus) {
                void copyInterviewLink({
                  candidateInviteExpiresAt: record.roundCandidateInviteExpiresAt ?? null,
                  interviewLink: record.roundInterviewLink,
                  status: record.roundStatus,
                });
              }
            }}
            type="button"
            variant="outline"
          >
            <IconCopy className="size-4" />
            复制面试链接
          </Button>
        ) : null}
      </div>
      {showCopyInterviewLink && interviewLinkState ? (
        <p
          className={cn(
            "mt-2 w-full text-right text-xs",
            interviewLinkState.copyDisabled ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {interviewLinkState.message}
        </p>
      ) : null}
      {hasRecommendedQuestions ? (
        <RecommendedQuestionsDialog
          onOpenChange={setRecommendedQuestionsOpen}
          open={recommendedQuestionsOpen}
          questions={recommendedQuestions}
        />
      ) : null}
    </>
  );
}

export function InterviewResultFrame({
  evaluationSummary,
  record,
  report,
}: {
  evaluationSummary: StudioPersonDetailViewModel["selectedResultEvaluationSummary"];
  record: InterviewResultRecord;
  report: StudioPersonDetailViewModel["selectedResultReport"];
}) {
  return (
    <Frame className="h-full">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <FrameTitle>面试结果</FrameTitle>
        <Badge variant={report ? getReportBadgeVariant(report.status) : "outline"}>
          {report ? formatReportStatus(report.status) : "暂无报告"}
        </Badge>
      </FrameHeader>
      <FramePanel className="flex-1">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <SummaryMetric
            label="开始时间"
            value={
              <TimeDisplay emptyText="未记录" value={report?.startedAt ?? report?.createdAt} />
            }
          />
          <SummaryMetric
            label="结束时间"
            value={<TimeDisplay emptyText="未记录" value={report?.endedAt ?? report?.updatedAt} />}
          />
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-4 border-border/50 border-t pt-5 sm:grid-cols-3">
          <SummaryMetric
            label="评分"
            value={
              evaluationSummary.overallScore === null
                ? "—"
                : `${evaluationSummary.overallScore} / 100`
            }
          />
          <SummaryMetric
            label="建议"
            value={
              evaluationSummary.recommendation ? (
                <Badge variant={resolveRecommendationVariant(evaluationSummary.recommendation)}>
                  {evaluationSummary.recommendation}
                </Badge>
              ) : (
                "待生成"
              )
            }
          />
          <SummaryMetric
            label="对话"
            value={report ? `${report.userTurnCount} 次候选人回复` : "候选人完成后生成"}
          />
        </div>
        <MarkdownView
          className="mt-5 border-border/50 border-t pt-5 text-muted-foreground text-sm leading-6"
          content={compactText(
            evaluationSummary.overallAssessment ?? report?.transcriptSummary ?? null,
            "候选人完成面试后，这里会优先显示结论、评分和关键摘要。",
          )}
        />
        {record.roundCandidateFeedback ? (
          <div className="mt-5 border-border/50 border-t pt-5">
            <h3 className="mb-3 font-medium text-sm">候选人反馈</h3>
            <CandidateInterviewFeedbackContent feedback={record.roundCandidateFeedback} />
          </div>
        ) : null}
        <InterviewResultActionRow record={record} />
      </FramePanel>
    </Frame>
  );
}
