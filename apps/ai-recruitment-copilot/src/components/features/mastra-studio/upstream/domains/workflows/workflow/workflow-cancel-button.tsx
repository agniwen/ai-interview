import { Button } from "@mastra/playground-ui/components/Button";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Loader2, StopCircle } from "lucide-react";

export interface WorkflowCancelButtonProps {
  status?: string;
  cancelMessage: string | null;
  isCancelling: boolean;
  onCancel: () => void;
  disabled?: boolean;
}

const DONE_STATUSES = new Set(["success", "failed", "canceled", "tripwire"]);
const VISIBLE_STATUSES = new Set(["running", "suspended", "paused"]);

export function WorkflowCancelButton({
  status,
  cancelMessage,
  isCancelling,
  onCancel,
  disabled,
}: WorkflowCancelButtonProps) {
  if (!status || !VISIBLE_STATUSES.has(status)) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="default"
      className="w-full"
      onClick={onCancel}
      disabled={disabled || !!cancelMessage || isCancelling || DONE_STATUSES.has(status)}
    >
      {isCancelling ? (
        <Icon>
          <Loader2 className="animate-spin" />
        </Icon>
      ) : (
        <Icon>
          <StopCircle />
        </Icon>
      )}
      {cancelMessage || "取消工作流运行"}
    </Button>
  );
}
