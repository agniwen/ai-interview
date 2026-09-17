"use client";

import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNextBusinessInterviewLabel } from "@app/shared/human-interview-rounds";
import { RecruitingActionButton as Button } from "./recruiting-action-button";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { invalidateHumanInterviewCandidateQueries } from "@/lib/client/api/query-keys";
import { ScheduleRoundDialog } from "./human-interview-stage-dialogs";
import { getHumanInterviewScheduleBlockReason } from "./human-interview-stage-utils";
import { useHumanInterviewStageQueries } from "./use-human-interview-stage-queries";

export function ScheduleHumanInterviewButton({
  candidateId,
  candidateName,
  onScheduled,
  targetStage = "second_interview",
}: {
  onScheduled?: () => void;
  targetStage?: "second_interview" | "final_interview";
  candidateId: string;
  candidateName: string;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { rounds, hasData, initialError } = useHumanInterviewStageQueries(slug, candidateId);
  let disabledReason = getHumanInterviewScheduleBlockReason(rounds);
  if (!hasData) {
    disabledReason = initialError ? "面试安排加载失败，请刷新后重试。" : "正在加载面试安排…";
  }
  const button = (
    <Button
      disabledReason={disabledReason}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:active:scale-100"
      onClick={() => {
        if (disabledReason) {
          return;
        }
        setOpen(true);
      }}
      size="sm"
      type="button"
    >
      <IconPlus data-icon="inline-start" />
      {targetStage === "final_interview" ? "安排终试" : "安排复试"}
    </Button>
  );
  return (
    <>
      {button}
      {open ? (
        <ScheduleRoundDialog
          candidateId={candidateId}
          candidateName={candidateName}
          defaultLabel={getNextBusinessInterviewLabel(rounds)}
          passedRoundCount={
            rounds.filter(
              (round) =>
                round.status === "completed" &&
                round.outcome === "pass" &&
                round.label !== "CEO面试",
            ).length
          }
          onOpenChange={setOpen}
          onScheduled={async () => {
            await invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
            onScheduled?.();
          }}
          open={open}
        />
      ) : null}
    </>
  );
}
