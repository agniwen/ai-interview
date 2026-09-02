import { countDisplayInterviewTurns } from "@app/shared/interview-transcript-turns";
import { cn } from "@app/shared/utils";
import type { ReactNode } from "react";

import { env } from "@/env/client";
import { TimeDisplay } from "@/components/features/display/time-display";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";

import { ConversationTranscript } from "../interviews/interview-detail/conversation-transcript";
import { HighlightedText } from "../interviews/interview-detail/keyword-highlight/highlighted-text";
import { KeywordHighlightLegend } from "../interviews/interview-detail/keyword-highlight/legend";
import { DetailRow } from "../interviews/interview-detail/detail-row";
import { formatInterviewEndReason } from "../interviews/interview-detail/helpers";
import {
  EvaluationResults,
  evaluationPayloadSchema,
} from "../interviews/interview-detail/evaluation-results";
import type { EvidenceQuote } from "../interviews/interview-detail/evaluation-results";
import { InterviewMetricsPanel } from "../interviews/interview-detail/interview-metrics-panel";
import { KeyInterviewInformation } from "../interviews/interview-detail/key-interview-information";
import { RecordingPlayer } from "../interviews/interview-detail/recording-player";
import { ReportMetadataButton } from "../studio-person-detail-metadata";
import type { resolveActiveEvidence } from "../studio-person-detail-sections";
import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";

export function InterviewReportDetailSection({
  children,
  className,
  panelClassName,
  surface,
  title,
}: {
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  surface: "card" | "frame";
  title: string;
}) {
  if (surface === "card") {
    return (
      <Card className={className}>
        <CardHeader className={className ? "shrink-0" : undefined}>
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardPanel className={panelClassName}>{children}</CardPanel>
      </Card>
    );
  }

  return (
    <Frame className={className}>
      <FrameHeader className={className ? "shrink-0" : undefined}>
        <FrameTitle>{title}</FrameTitle>
      </FrameHeader>
      <FramePanel className={panelClassName}>{children}</FramePanel>
    </Frame>
  );
}

export function InterviewReportDetails({
  activeTurnIndex,
  leftSupplement,
  onEvidenceSelect,
  report,
  surface,
}: {
  activeTurnIndex: number | null;
  leftSupplement?: ReactNode;
  onEvidenceSelect: (evidence: EvidenceQuote) => void;
  report: NonNullable<StudioPersonDetailViewModel["selectedResultReport"]>;
  surface: "card" | "frame";
}) {
  const parsedEvaluation = evaluationPayloadSchema.safeParse(report.evaluationCriteriaResults);

  return (
    <div className="flex flex-col gap-4">
      {report.turns.length > 0 ? <KeywordHighlightLegend /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
        <div className="space-y-4">
          <InterviewReportDetailSection surface={surface} title="最终总结">
            <div className="mb-4 border-border/50 border-b pb-4">
              <DetailRow label="结束原因" value={formatInterviewEndReason(report.metadata)} />
            </div>
            <div className="text-muted-foreground text-sm leading-6">
              <HighlightedText text={report.transcriptSummary ?? "暂无总结。"} />
            </div>
            {report.latestError ? (
              <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
                {report.latestError}
              </div>
            ) : null}
          </InterviewReportDetailSection>
          {report.keyInformation ? (
            <KeyInterviewInformation
              data={report.keyInformation}
              onEvidenceSelect={onEvidenceSelect}
              surface={surface}
            />
          ) : null}
          <InterviewReportDetailSection surface={surface} title="评估指标">
            <ScrollArea className="max-h-[420px] pr-1" scrollFade>
              <EvaluationResults
                data={parsedEvaluation.success ? parsedEvaluation.data : {}}
                dataCollectionResults={report.dataCollectionResults}
                onEvidenceSelect={onEvidenceSelect}
              />
            </ScrollArea>
          </InterviewReportDetailSection>
          {leftSupplement}
        </div>
        <div className="lg:relative">
          <InterviewReportDetailSection
            className="h-[480px] overflow-hidden lg:absolute lg:inset-0 lg:h-auto"
            panelClassName={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              surface === "frame" ? "p-0" : undefined,
            )}
            surface={surface}
            title="对话记录"
          >
            <ConversationTranscript activeTurnIndex={activeTurnIndex} turns={report.turns} />
          </InterviewReportDetailSection>
        </div>
      </div>
    </div>
  );
}

export function InterviewReportSupplement({
  activeEvidence,
  model,
  report,
}: {
  activeEvidence: ReturnType<typeof resolveActiveEvidence>;
  model: StudioPersonDetailViewModel;
  report: NonNullable<StudioPersonDetailViewModel["selectedResultReport"]>;
}) {
  const { canViewReportMetadata, isPublic, resultRoundId, setMetadataReport } = model;
  const transcriptStats = countDisplayInterviewTurns(report.turns);

  return (
    <>
      {env.NEXT_PUBLIC_ENABLE_INTERVIEW_DEVELOPER_DETAILS ? (
        <Frame>
          <FrameHeader className="flex-row items-center justify-between gap-3">
            <FrameTitle>会话概览</FrameTitle>
            <ReportMetadataButton
              disabled={!report.snapshotMetadata}
              label=""
              onClick={() => setMetadataReport(report)}
              visible={canViewReportMetadata}
            />
          </FrameHeader>
          <FramePanel>
            <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
              <DetailRow
                label="会话 ID"
                value={<span className="break-all">{report.conversationId}</span>}
              />
              <DetailRow label="同步时间" value={<TimeDisplay value={report.lastSyncedAt} />} />
              <DetailRow
                label="消息统计"
                value={`共 ${transcriptStats.turnCount} 条 · 候选人 ${transcriptStats.userTurnCount} 条 · 面试官 ${transcriptStats.agentTurnCount} 条`}
              />
              <DetailRow
                label="Webhook"
                value={
                  report.webhookReceivedAt ? (
                    <TimeDisplay value={report.webhookReceivedAt} />
                  ) : (
                    "未收到"
                  )
                }
              />
            </div>
          </FramePanel>
        </Frame>
      ) : null}
      {env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING ? (
        <RecordingPlayer
          accessMode={isPublic ? "public" : "authed"}
          conversationId={report.conversationId}
          durationSecs={report.recordingDurationSecs}
          key={report.conversationId}
          recordId={resultRoundId ?? ""}
          seekToSecs={activeEvidence?.timeInCallSecs ?? null}
          status={report.recordingStatus}
        />
      ) : null}
      {env.NEXT_PUBLIC_ENABLE_INTERVIEW_DEVELOPER_DETAILS ? (
        <InterviewMetricsPanel metrics={report.metrics ?? {}} />
      ) : null}
    </>
  );
}
