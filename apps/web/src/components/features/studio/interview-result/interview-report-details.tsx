import { IconBulb, IconChartBar, IconFileText, IconMessages } from "@tabler/icons-react";
import { parseInterviewDataCollectionResults } from "@app/shared/interview/question-outcomes";
import { cn } from "@app/shared/utils";

import { env } from "@/env/client";

import {
  ConversationTranscript,
  TranscriptExportActions,
} from "../interviews/interview-detail/conversation-transcript";
import type { TranscriptCandidateAvatar } from "../interviews/interview-detail/conversation-transcript";
import { HighlightedText } from "../interviews/interview-detail/keyword-highlight/highlighted-text";
import { DetailRow } from "../interviews/interview-detail/detail-row";
import { formatInterviewEndReason } from "../interviews/interview-detail/helpers";
import {
  EvaluationOverall,
  evaluationPayloadSchema,
  resolveEvaluationOverall,
} from "../interviews/interview-detail/evaluation-results";
import type { EvidenceQuote } from "../interviews/interview-detail/evaluation-results";
import { KeyInterviewInformation } from "../interviews/interview-detail/key-interview-information";
import { RecordingPlayer } from "../interviews/interview-detail/recording-player";
import type { resolveActiveEvidence } from "../studio-person-detail-sections";
import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";
import { ResultSection } from "./result-section";

type InterviewReport = NonNullable<StudioPersonDetailViewModel["selectedResultReport"]>;

function hasKeyInformation(
  report: InterviewReport,
): report is InterviewReport & { keyInformation: NonNullable<InterviewReport["keyInformation"]> } {
  const info = report.keyInformation;
  return Boolean(
    info &&
    (info.skillEvidence.length > 0 ||
      info.quantitativeInformation.length > 0 ||
      info.risks.length > 0),
  );
}

/** 概览页签：结束原因与总结、关键信息。Overview tab: end reason, summary and key information. */
export function InterviewReportSummarySections({
  onEvidenceSelect,
  report,
}: {
  onEvidenceSelect: (evidence: EvidenceQuote) => void;
  report: InterviewReport;
}) {
  return (
    <>
      <ResultSection contentClassName="flex flex-col gap-3" icon={IconFileText} title="最终总结">
        <DetailRow label="结束原因" value={formatInterviewEndReason(report.metadata)} />
        <div className="text-foreground text-sm leading-6">
          <HighlightedText text={report.transcriptSummary ?? "暂无总结。"} />
        </div>
        {report.latestError ? (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
            {report.latestError}
          </div>
        ) : null}
      </ResultSection>
      {hasKeyInformation(report) ? (
        <ResultSection icon={IconBulb} title="重点信息">
          <KeyInterviewInformation
            data={report.keyInformation}
            onEvidenceSelect={onEvidenceSelect}
            surface="none"
          />
        </ResultSection>
      ) : null}
    </>
  );
}

/** 逐题评估页签顶部的评分与评价。Overall score and assessment atop the per-question tab. */
export function InterviewReportOverallSection({ report }: { report: InterviewReport }) {
  const parsedEvaluation = evaluationPayloadSchema.safeParse(report.evaluationCriteriaResults);
  const overall = resolveEvaluationOverall(
    parsedEvaluation.success ? parsedEvaluation.data : {},
    parseInterviewDataCollectionResults(report.dataCollectionResults)?.questions ?? null,
  );
  if (!overall) {
    return null;
  }
  return (
    <ResultSection icon={IconChartBar} title="评分与评价">
      <EvaluationOverall overall={overall} />
    </ResultSection>
  );
}

/** 对话与录像页签的对话记录。Transcript for the conversation & recording tab. */
export function InterviewReportTranscriptSection({
  activeTurnIndex,
  candidateAvatar,
  candidateName,
  className,
  report,
  scroll = "contained",
}: {
  activeTurnIndex: number | null;
  candidateAvatar?: TranscriptCandidateAvatar | null;
  candidateName?: string | null;
  className?: string;
  report: InterviewReport;
  scroll?: "contained" | "flow";
}) {
  const transcriptFileName = `面试对话记录-${candidateName?.trim() || report.conversationId}`;

  return (
    <ResultSection
      action={
        <TranscriptExportActions
          candidateName={candidateName}
          fileName={transcriptFileName}
          turns={report.turns}
        />
      }
      className={cn("min-h-0", className)}
      contentClassName={scroll === "contained" ? "flex min-h-0 flex-1 flex-col" : undefined}
      icon={IconMessages}
      title="对话记录"
    >
      <ConversationTranscript
        activeTurnIndex={activeTurnIndex}
        candidateAvatar={candidateAvatar}
        candidateName={candidateName}
        className={scroll === "contained" ? "-mx-2 min-h-0 flex-1" : "-mx-2"}
        scroll={scroll}
        turns={report.turns}
      />
    </ResultSection>
  );
}

/** 对话与录像页签的录像。Recording for the conversation & recording tab. */
export function InterviewReportRecording({
  activeEvidence,
  model,
  report,
}: {
  activeEvidence: ReturnType<typeof resolveActiveEvidence>;
  model: StudioPersonDetailViewModel;
  report: InterviewReport;
}) {
  if (!env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING) {
    return null;
  }

  return (
    <RecordingPlayer
      accessMode={model.isPublic ? "public" : "authed"}
      conversationId={report.conversationId}
      durationSecs={report.recordingDurationSecs}
      key={report.conversationId}
      recordId={model.resultRoundId ?? ""}
      seekToSecs={activeEvidence?.timeInCallSecs ?? null}
      status={report.recordingStatus}
    />
  );
}
