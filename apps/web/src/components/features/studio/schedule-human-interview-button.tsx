"use client";

import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNextBusinessInterviewLabel } from "@app/shared/human-interview-rounds";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { invalidateHumanInterviewCandidateQueries } from "@/lib/client/api/query-keys";
import { ScheduleRoundDialog } from "./human-interview-stage-dialogs";
import { getHumanInterviewScheduleBlockReason } from "./human-interview-stage-utils";
import { useHumanInterviewStageQueries } from "./use-human-interview-stage-queries";

export function ScheduleHumanInterviewButton({
  candidateId,
  candidateName,
}: {
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
      aria-disabled={disabledReason !== null}
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
      安排真人复面
    </Button>
  );
  return (
    <>
      {disabledReason ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
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
          onScheduled={() => {
            void invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
          }}
          open={open}
        />
      ) : null}
    </>
  );
}
