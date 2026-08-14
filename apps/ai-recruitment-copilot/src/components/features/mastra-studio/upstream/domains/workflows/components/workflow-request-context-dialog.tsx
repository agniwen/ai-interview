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
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { RequestContextSchemaForm } from "@/components/features/mastra-studio/upstream/domains/request-context/components/request-context-schema-form";

export interface WorkflowRequestContextDialogProps {
  requestContextSchema: string;
}

export const WorkflowRequestContextDialog = ({
  requestContextSchema,
}: WorkflowRequestContextDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            aria-label="请求上下文"
            onClick={() => setOpen(true)}
          >
            <Icon>
              <KeyRound />
            </Icon>
          </Button>
        </TooltipTrigger>
        <TooltipContent>请求上下文</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>请求上下文</DialogTitle>
            <DialogDescription>设置此次工作流运行的请求上下文值</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <RequestContextSchemaForm requestContextSchema={requestContextSchema} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};
