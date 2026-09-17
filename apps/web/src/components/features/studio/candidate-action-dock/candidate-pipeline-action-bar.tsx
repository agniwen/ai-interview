import { useQueryClient } from "@tanstack/react-query";
import { IconRobot } from "@tabler/icons-react";
import { PipelineStageActionBar } from "../pipeline-stage-action-bar";
import type { PipelineStageActionBarProps } from "../pipeline-stage-action-bar";
import { TransitionCandidateDialog } from "../resumes/transition-candidate-dialog";
import { LaunchInterviewDialog } from "../resumes/launch-interview-dialog";
import { RecruitingActionButton as Button } from "../recruiting-action-button";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useCandidateActionDock, useCandidateActionFlow } from "./candidate-action-dock";

export function CandidatePipelineActionBar({
  candidate,
  ...props
}: PipelineStageActionBarProps & {
  candidate: { id: string; candidateName: string };
}) {
  const dock = useCandidateActionDock();
  const close = useCandidateActionFlow("close-candidate");
  const reopen = useCandidateActionFlow("reopen-candidate");
  const client = useQueryClient();
  const slug = useWorkspaceSlug();
  const completed = () => {
    for (const scope of [
      "studio-resumes",
      "studio-resume-metrics",
      "studio-resume-rounds",
      "studio-interviews",
    ]) {
      void client.invalidateQueries({ queryKey: [scope, slug] });
    }
  };
  return (
    <>
      <PipelineStageActionBar
        {...props}
        onRequestClose={dock ? () => close.setOpen(true) : props.onRequestClose}
        onRequestReactivate={dock ? () => reopen.setOpen(true) : props.onRequestReactivate}
      />
      {dock ? (
        <>
          <TransitionCandidateDialog
            candidate={candidate}
            mode="close"
            open={close.open}
            onOpenChange={close.setOpen}
            onCompleted={completed}
          />
          <TransitionCandidateDialog
            candidate={candidate}
            mode="reactivate"
            open={reopen.open}
            onOpenChange={reopen.setOpen}
            onCompleted={completed}
          />
        </>
      ) : null}
    </>
  );
}

export function LaunchAiInterviewAction({
  candidate,
  disabledReason,
}: {
  candidate: { id: string; candidateName: string | null };
  disabledReason: string | null;
}) {
  const flow = useCandidateActionFlow("launch-ai-interview");
  const client = useQueryClient();
  const slug = useWorkspaceSlug();
  return (
    <>
      <Button size="sm" disabledReason={disabledReason} onClick={() => flow.setOpen(true)}>
        <IconRobot className="size-4" />
        发起 AI初面
      </Button>
      <LaunchInterviewDialog
        open={flow.open}
        onOpenChange={flow.setOpen}
        recordId={candidate.id}
        candidateName={candidate.candidateName}
        onLaunched={() => {
          void client.invalidateQueries({ queryKey: ["studio-resumes", slug] });
          void client.invalidateQueries({ queryKey: ["studio-resume-rounds", slug] });
          void client.invalidateQueries({ queryKey: ["studio-interviews", slug] });
        }}
      />
    </>
  );
}
