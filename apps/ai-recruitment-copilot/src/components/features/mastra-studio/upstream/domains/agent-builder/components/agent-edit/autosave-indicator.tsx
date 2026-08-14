import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { CheckIcon } from "lucide-react";
import type { AutosaveStatus } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-autosave-agent";

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  lastError: Error | null;
  onRetry: () => void;
}

export const AutosaveIndicator = ({ status, lastError, onRetry }: AutosaveIndicatorProps) => {
  if (status === "saving") {
    return (
      <span
        className="flex items-center gap-1.5 text-ui-sm text-neutral3"
        data-testid="agent-builder-autosave-saving"
      >
        <Spinner size="sm" />
        正在保存…
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        className="flex items-center gap-1.5 text-ui-sm text-neutral3"
        data-testid="agent-builder-autosave-saved"
      >
        <CheckIcon className="h-3.5 w-3.5" />
        已保存
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        className="flex items-center gap-1.5 text-ui-sm text-neutral3"
        data-testid="agent-builder-autosave-error"
      >
        <span title={lastError?.message}>保存失败</span>
        <button
          type="button"
          onClick={onRetry}
          data-testid="agent-builder-autosave-retry"
          className="underline underline-offset-2 hover:text-neutral4"
        >
          重试
        </button>
      </span>
    );
  }

  return null;
};
