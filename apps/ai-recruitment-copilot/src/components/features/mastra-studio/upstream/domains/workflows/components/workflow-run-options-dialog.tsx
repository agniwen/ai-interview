import { Button } from "@mastra/playground-ui/components/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { WorkflowTracingRunOptions } from "./workflow-tracing-run-options";

export const WorkflowRunOptionsDialog = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            aria-label="运行选项"
            onClick={() => setOpen(true)}
          >
            <Icon>
              <SlidersHorizontal />
            </Icon>
          </Button>
        </TooltipTrigger>
        <TooltipContent>运行选项</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>运行选项</DialogTitle>
            <DialogDescription>配置此次工作流运行的追踪和调试选项</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <WorkflowTracingRunOptions onSaved={() => setOpen(false)} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};
