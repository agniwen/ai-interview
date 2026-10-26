"use client";

import type { HumanInterviewRoundRecord } from "@app/shared/studio-pipeline-stages";
import { useState } from "react";
import type { ReactNode } from "react";
import { IconMapPin, IconBriefcase } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { findHumanInterviewRoundMeeting } from "@app/shared/human-interview-meeting-detail";
import type { StudioHumanInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { humanInterviewFormatMeta } from "@app/db-schema/studio-interviews";
import { Modal } from "@/components/ui/modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeDisplay } from "@/components/features/display/time-display";
import { listHumanInterviewMeetings, listHumanInterviewRounds } from "@/lib/client/api";
import { fetchHumanInterviewMeetingDetail } from "@/lib/client/api/endpoints/human-interview-meeting-detail";
import { humanInterviewKeys } from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { RoundEvaluation } from "../human-interview-evaluation-summary";
import { HumanInterviewMeetingTranscript } from "../human-interview-meeting-detail-page";
import {
  InterviewRecordInterviewersCell,
  InterviewRecordResultCell,
  InterviewRecordStatusCell,
} from "./interview-record-cells";

function DetailNotice({ children }: { children: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function DetailError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>加载详情失败</AlertTitle>
      <AlertDescription>
        {error.message}
        <Button variant="outline" size="sm" onClick={retry}>
          重试
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function InterviewInformation({
  record,
  round,
}: {
  record: StudioHumanInterviewRecordListRecord;
  round?: HumanInterviewRoundRecord;
}) {
  return (
    <section aria-label="面试信息" className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <IconBriefcase aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="wrap-anywhere">{record.jobDescriptionName ?? "未关联岗位"}</span>
        </span>
        <InterviewRecordStatusCell record={round ? { ...record, status: round.status } : record} />
        <InterviewRecordResultCell record={record} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
        <span aria-label="面试官">
          <InterviewRecordInterviewersCell
            record={round ? { ...record, interviewers: round.interviewers } : record}
          />
        </span>
        <span>{humanInterviewFormatMeta[round?.format ?? record.format].label}</span>
        {round?.location ? (
          <span className="flex items-center gap-1.5">
            <IconMapPin aria-hidden className="size-4" />
            {round.location}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <span aria-label="计划时间" title="计划时间">
          <TimeDisplay value={round?.scheduledAt ?? record.scheduledAt} emptyText="未排期" />
        </span>
        {round?.completedAt ? (
          <span aria-label="完成时间" title="完成时间">
            完成于 <TimeDisplay value={round.completedAt} />
          </span>
        ) : null}
      </div>
    </section>
  );
}

function RoundEvaluationContent({ round }: { round: HumanInterviewRoundRecord }) {
  const evaluation =
    round.evaluation ?? round.reviewerEvaluations?.[0]?.evaluation ?? round.aiEvaluation;
  const emptyText =
    round.feedback ||
    (round.evaluationStatus === "generating" ? "面试评价正在生成。" : "暂无面试评价。");
  return (
    <>
      {evaluation ? (
        <RoundEvaluation
          evaluation={evaluation}
          round={round}
          className="border-t-0 pt-0"
          autoScrollDetails={false}
        />
      ) : (
        <DetailNotice>{emptyText}</DetailNotice>
      )}
      {round.evaluationError ? (
        <Alert>
          <AlertDescription>{round.evaluationError}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function DetailLoading({ label }: { label: string }) {
  return (
    <output aria-label={label}>
      <Skeleton className="h-64 w-full" />
    </output>
  );
}

function TranscriptContent({
  record,
  active,
}: {
  record: StudioHumanInterviewRecordListRecord;
  active: boolean;
}) {
  const slug = useWorkspaceSlug();
  const meetingsQuery = useQuery({
    enabled: active,
    queryFn: () => listHumanInterviewMeetings(slug, { interviewRecordId: record.candidateId }),
    queryKey: humanInterviewKeys.meetings(slug, record.candidateId),
  });
  const meeting = findHumanInterviewRoundMeeting(meetingsQuery.data ?? [], record.id);
  const meetingId = meeting?.status === "ended" ? meeting.id : null;
  const query = useQuery({
    enabled: active && meetingId !== null,
    queryFn: ({ signal }) => {
      if (!meetingId) {
        throw new Error("暂无已结束的面试会议");
      }
      return fetchHumanInterviewMeetingDetail(
        { candidateId: record.candidateId, meetingId, roundId: record.id, slug },
        signal,
      );
    },
    queryKey: humanInterviewKeys.meetingDetail(
      slug,
      record.candidateId,
      record.id,
      meetingId ?? "",
    ),
    refetchInterval: (state) =>
      active &&
      !state.state.error &&
      (state.state.data?.transcriptionState === "pending" ||
        state.state.data?.transcriptionState === "processing")
        ? 5000
        : false,
    refetchIntervalInBackground: false,
  });
  if (meetingsQuery.isError) {
    return (
      <DetailError
        error={meetingsQuery.error}
        retry={() => {
          void meetingsQuery.refetch();
        }}
      />
    );
  }
  if (meetingsQuery.isPending) {
    return <DetailLoading label="正在加载会议" />;
  }
  if (!meetingId) {
    return <DetailNotice>暂无已结束会议的对话记录。</DetailNotice>;
  }
  if (query.isError) {
    return (
      <DetailError
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (!query.data) {
    return <DetailLoading label="正在加载对话记录" />;
  }
  return <HumanInterviewMeetingTranscript detail={query.data} />;
}

export function HumanInterviewRecordDetailContent({
  record,
  active,
  shell,
}: {
  record: StudioHumanInterviewRecordListRecord;
  active: boolean;
  shell?: (slots: { header: ReactNode; body: ReactNode }) => ReactNode;
}) {
  const slug = useWorkspaceSlug();
  const [tab, setTab] = useState("evaluation");
  const query = useQuery({
    enabled: active,
    queryFn: () => listHumanInterviewRounds(slug, record.candidateId),
    queryKey: humanInterviewKeys.rounds(slug, record.candidateId),
    refetchInterval: (state) =>
      active &&
      !state.state.error &&
      state.state.data?.some(
        (item) => item.id === record.id && item.evaluationStatus === "generating",
      )
        ? 5000
        : false,
    refetchIntervalInBackground: false,
  });
  const round = query.data?.find((item) => item.id === record.id);
  let evaluationContent = <DetailLoading label="正在加载面试评价" />;
  if (query.isError) {
    evaluationContent = (
      <DetailError
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  } else if (round) {
    evaluationContent = <RoundEvaluationContent round={round} />;
  } else if (!query.isPending) {
    evaluationContent = <DetailNotice>该面试轮次已不存在或无法访问。</DetailNotice>;
  }
  const header = (
    <div className="flex flex-col gap-4">
      <InterviewInformation record={record} round={round} />
      <TabsList variant="underline" aria-label="真人面试详情内容">
        <TabsTrigger value="evaluation">面试详情</TabsTrigger>
        <TabsTrigger value="transcript">聊天转录</TabsTrigger>
      </TabsList>
    </div>
  );
  const body = (
    <>
      <TabsContent value="evaluation" className="flex flex-col gap-4">
        {round?.notes ? (
          <p className="whitespace-pre-wrap text-muted-foreground text-sm" aria-label="备注">
            {round.notes}
          </p>
        ) : null}
        {evaluationContent}
      </TabsContent>
      <TabsContent value="transcript" className="flex flex-col gap-4">
        <TranscriptContent record={record} active={active && tab === "transcript"} />
      </TabsContent>
    </>
  );
  return (
    <Tabs value={tab} onValueChange={setTab}>
      {shell ? (
        shell({ body, header })
      ) : (
        <>
          {header}
          {body}
        </>
      )}
    </Tabs>
  );
}

export function HumanInterviewRecordDetailDialog({
  record,
  onOpenChange,
}: {
  record: StudioHumanInterviewRecordListRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [displayedRecord, setDisplayedRecord] = useState(record);
  if (record && record !== displayedRecord) {
    setDisplayedRecord(record);
  }
  if (!displayedRecord) {
    return null;
  }
  return (
    <HumanInterviewRecordDetailContent
      key={displayedRecord.id}
      record={displayedRecord}
      active={record !== null}
      shell={({ body, header }) => (
        <Modal
          open={record !== null}
          onOpenChange={onOpenChange}
          placement="right"
          size="lg"
          title={`真人面试 · ${displayedRecord.candidateName}`}
          description={displayedRecord.roundLabel}
          headerExtra={header}
          headerClassName="pb-0"
          bodyClassName="scroll-fade-none pt-4"
        >
          {body}
        </Modal>
      )}
    />
  );
}
