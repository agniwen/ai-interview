import { Button } from "@mastra/playground-ui/components/Button";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Check, X } from "lucide-react";
import { useToolCall } from "@/components/features/mastra-studio/upstream/services/tool-call-provider";

export interface ToolApprovalButtonsProps {
  toolCallId: string;
  toolName: string;
  toolCalled: boolean;
  toolApprovalMetadata:
    | {
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        runId?: string;
      }
    | undefined;
  isNetwork: boolean;
  isGenerateMode?: boolean;
}

export const ToolApprovalButtons = ({
  toolCalled,
  toolCallId,
  toolApprovalMetadata,
  toolName,
  isNetwork,
  isGenerateMode,
}: ToolApprovalButtonsProps) => {
  const {
    approveToolcall,
    declineToolcall,
    approveToolcallGenerate,
    declineToolcallGenerate,
    isRunning,
    toolCallApprovals,
    approveNetworkToolcall,
    declineNetworkToolcall,
    networkToolCallApprovals,
  } = useToolCall();

  const handleApprove = () => {
    if (isNetwork) {
      approveNetworkToolcall(toolName, toolApprovalMetadata?.runId);
    } else if (isGenerateMode) {
      approveToolcallGenerate(toolCallId);
    } else {
      approveToolcall(toolCallId);
    }
  };

  const handleDecline = () => {
    if (isNetwork) {
      declineNetworkToolcall(toolName, toolApprovalMetadata?.runId);
    } else if (isGenerateMode) {
      declineToolcallGenerate(toolCallId);
    } else {
      declineToolcall(toolCallId);
    }
  };

  const toolCallApprovalStatus = isNetwork
    ? networkToolCallApprovals?.[
        toolApprovalMetadata?.runId ? `${toolApprovalMetadata.runId}-${toolName}` : toolName
      ]?.status
    : toolCallApprovals?.[toolCallId]?.status;

  if (toolApprovalMetadata && !toolCalled) {
    return (
      <div>
        <p className="font-medium pb-2">需要审批</p>
        <div className="flex gap-2 items-center">
          <Button
            onClick={handleApprove}
            disabled={isRunning || !!toolCallApprovalStatus}
            className={toolCallApprovalStatus === "approved" ? "text-accent1!" : ""}
          >
            <Icon>
              <Check />
            </Icon>
            批准
          </Button>
          <Button
            onClick={handleDecline}
            disabled={isRunning || !!toolCallApprovalStatus}
            className={toolCallApprovalStatus === "declined" ? "text-accent2!" : ""}
          >
            <Icon>
              <X />
            </Icon>
            拒绝
          </Button>
        </div>
      </div>
    );
  }

  return null;
};
