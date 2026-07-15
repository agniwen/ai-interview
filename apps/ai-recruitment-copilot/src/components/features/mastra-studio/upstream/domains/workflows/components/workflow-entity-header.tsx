import { Badge } from "@mastra/playground-ui/components/Badge";
import { EntityHeader } from "@mastra/playground-ui/components/EntityHeader";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@mastra/playground-ui/components/Tooltip";
import { useCopyToClipboard } from "@mastra/playground-ui/hooks/use-copy-to-clipboard";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import { CopyIcon, Cpu } from "lucide-react";

import { useWorkflow } from "@/components/features/mastra-studio/upstream/hooks/use-workflows";

export interface WorkflowEntityHeaderProps {
  workflowId: string;
}

export const WorkflowEntityHeader = ({ workflowId }: WorkflowEntityHeaderProps) => {
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { handleCopy } = useCopyToClipboard({ text: workflowId });

  const workflowName = workflow?.name || workflowId;
  const stepsCount = Object.keys(workflow?.steps ?? {}).length;

  return (
    <TooltipProvider>
      <EntityHeader icon={<WorkflowIcon />} title={workflowName} isLoading={isLoading}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={handleCopy} className="h-badge-default shrink-0">
                <Badge icon={<CopyIcon />} variant="default">
                  {workflowId}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>复制工作流 ID 以在代码中使用</TooltipContent>
          </Tooltip>

          <Badge>{stepsCount} 个步骤</Badge>

          {workflow?.isProcessorWorkflow && (
            <Badge icon={<Cpu className="h-3 w-3" />} className="bg-violet-500/20 text-violet-400">
              处理器
            </Badge>
          )}
        </div>
      </EntityHeader>
    </TooltipProvider>
  );
};
