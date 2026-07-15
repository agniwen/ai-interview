import { cn } from "@mastra/playground-ui/utils/cn";
import { useFormContext, useWatch } from "react-hook-form";
import type { AgentBuilderEditFormValues } from "../../../schemas";

export interface AgentProfileDetailsProps {
  disabled?: boolean;
  className?: string;
  mode?: "default" | "highlighted";
}

const HIGHLIGHTED_CLASSNAME =
  "px-24 justify-center items-center text-center [&_input]:text-center [&_textarea]:text-center";

export const AgentProfileDetails = ({
  disabled = false,
  className,
  mode = "default",
}: AgentProfileDetailsProps) => {
  const { setValue, control } = useFormContext<AgentBuilderEditFormValues>();
  const draftName = useWatch({ control, name: "name" }) ?? "";
  const draftDescription = useWatch({ control, name: "description" }) ?? "";

  const handleDraftNameChange = (value: string) => {
    if (disabled) {
      return;
    }
    setValue("name", value, { shouldDirty: true });
  };
  const handleDraftDescriptionChange = (value: string) => {
    if (disabled) {
      return;
    }
    setValue("description", value, { shouldDirty: true });
  };

  const isHighlighted = mode === "highlighted";

  return (
    <div
      className={cn(
        "flex w-full flex-col items-start gap-0.5 max-w-[44ch]",
        isHighlighted && HIGHLIGHTED_CLASSNAME,
        className,
      )}
    >
      <input
        type="text"
        value={draftName}
        onChange={(e) => handleDraftNameChange(e.target.value)}
        placeholder="未命名智能体"
        aria-label="智能体名称"
        disabled={disabled}
        data-testid="agent-configure-name"
        className="w-full max-w-sm rounded-lg px-3 py-1.5 text-ui-lg font-semibold text-neutral6 placeholder:text-neutral2 hover:bg-surface4 focus:bg-surface4 focus:outline-none disabled:cursor-not-allowed"
        style={{ viewTransitionName: "agent-name" }}
      />
      <textarea
        value={draftDescription}
        onChange={(e) => handleDraftDescriptionChange(e.target.value)}
        placeholder="此智能体用于做什么？"
        aria-label="描述"
        disabled={disabled}
        data-testid="agent-configure-description"
        rows={2}
        className="w-full resize-none field-sizing-content rounded-lg px-3 py-2 text-ui-md text-neutral6 placeholder:text-neutral2 hover:bg-surface4 focus:bg-surface4 focus:outline-none disabled:cursor-not-allowed"
        style={{ viewTransitionName: "agent-description" }}
      />
    </div>
  );
};
