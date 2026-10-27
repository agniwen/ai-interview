import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconRubberStamp } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { StudioSidePaneContent, useStudioSidePane } from "../studio/studio-side-pane-context";
import { OfferApprovalsPage } from "./page";

const APPROVAL_PANE_ID = "offer-approvals";

export function ApprovalInboxTrigger() {
  const pane = useStudioSidePane(APPROVAL_PANE_ID);
  const slug = useWorkspaceSlug();
  const canRead = useHasPermission("page", "offerApprovals");
  if (!canRead) {
    return null;
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              {...pane.triggerProps}
              aria-label={pane.isOpen ? "关闭审批" : "打开审批"}
              className={pane.isOpen ? "bg-accent" : undefined}
              size="icon-sm"
              variant="ghost"
            >
              <IconRubberStamp className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="bottom">审批</TooltipContent>
      </Tooltip>
      <StudioSidePaneContent id={APPROVAL_PANE_ID}>
        <OfferApprovalsPage slug={slug} sidePane />
      </StudioSidePaneContent>
    </>
  );
}
