"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { findHumanInterviewRoundMeeting } from "@app/shared/human-interview-meeting-detail";
import type { StudioHumanInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { listHumanInterviewMeetings, listHumanInterviewRounds } from "@/lib/client/api";
import {
  humanInterviewKeys,
  invalidateHumanInterviewCandidateQueries,
} from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { RoundScheduledAtControl } from "../human-interview-stage-rounds";
import { canRescheduleHumanInterviewRound } from "../human-interview-stage-utils";

export function HumanInterviewRecordEditDialog({
  record,
  onClose,
  onUpdated,
}: {
  record: StudioHumanInterviewRecordListRecord;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const rounds = useQuery({
    queryFn: () => listHumanInterviewRounds(slug, record.candidateId),
    queryKey: humanInterviewKeys.rounds(slug, record.candidateId),
    staleTime: 0,
  });
  const meetings = useQuery({
    queryFn: () => listHumanInterviewMeetings(slug, { interviewRecordId: record.candidateId }),
    queryKey: humanInterviewKeys.meetings(slug, record.candidateId),
    staleTime: 0,
  });
  const round = rounds.data?.find((item) => item.id === record.id);
  const meeting = findHumanInterviewRoundMeeting(meetings.data ?? [], record.id);
  const error = rounds.error ?? meetings.error;
  let content;
  if (error) {
    content = (
      <div role="alert">
        {error.message}
        <Button
          onClick={() => {
            void rounds.refetch();
            void meetings.refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  } else if (rounds.isFetching || meetings.isFetching) {
    content = <p className="text-muted-foreground">加载面试安排…</p>;
  } else if (!round || !canRescheduleHumanInterviewRound(round, meeting)) {
    content = <p className="text-muted-foreground">面试已结束、取消或正在进行，不可编辑安排。</p>;
  } else {
    content = (
      <RoundScheduledAtControl
        key={round.id}
        round={round}
        meeting={meeting}
        slug={slug}
        canUpdate
        initiallyEditing
        onCancel={onClose}
        onRescheduled={() => {
          void invalidateHumanInterviewCandidateQueries(queryClient, {
            candidateId: record.candidateId,
            slug,
          });
          onUpdated();
          onClose();
        }}
      />
    );
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`编辑真人面试 · ${record.candidateName}`}
      size="md"
      headerClassName="px-5 pt-5 pb-4"
      bodyClassName="scroll-fade-none px-5 pt-0 pb-5"
    >
      {content}
    </Modal>
  );
}
