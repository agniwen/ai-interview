import { Button } from "@mastra/playground-ui/components/Button";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { ArrowRightIcon, CheckIcon, LibraryIcon } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { AgentStepContainer } from "./agent-step-container";
import { useStreamRunning } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/stream-chat-context";
import { useWizard } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/wizard-context";
import { useVisibilityChange } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-visibility-change-agent";
import type { AgentBuilderEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/schemas";
import { startViewTransition } from "@/components/features/mastra-studio/upstream/lib/routing";

export interface AgentProfileLibraryStepProps {
  agentId: string;
}

export const AgentProfileLibraryStep = ({ agentId }: AgentProfileLibraryStepProps) => {
  const { next } = useWizard();
  const isStreaming = useStreamRunning();
  const { requestChange, dialog } = useVisibilityChange(agentId);
  const { control } = useFormContext<AgentBuilderEditFormValues>();
  const visibility = useWatch({ control, name: "visibility" });
  const isInLibrary = visibility === "public";

  const handleContinue = () => {
    startViewTransition(() => {
      next();
    });
  };

  return (
    <AgentStepContainer
      title="添加到你的库"
      description="将智能体添加到库后，工作区中的所有人都可以发现和试用它，也可将其复制为构建自己智能体的起点。"
      cta={
        <Button onClick={handleContinue} disabled={isStreaming}>
          继续{" "}
          <Icon>
            <ArrowRightIcon />
          </Icon>
        </Button>
      }
    >
      <div
        className="relative w-full h-full flex flex-col items-center justify-center gap-4 py-6 px-6 text-center"
        data-testid="agent-builder-library-step"
      >
        <Icon size="lg" className="text-neutral4">
          <LibraryIcon />
        </Icon>
        {isInLibrary ? (
          <p
            className="flex items-center gap-2 text-neutral2"
            data-testid="agent-builder-library-added"
          >
            <Icon>
              <CheckIcon />
            </Icon>
            已添加到你的库
          </p>
        ) : (
          <Button
            variant="primary"
            onClick={() => requestChange("public")}
            disabled={isStreaming}
            data-testid="agent-builder-library-add"
          >
            添加到库
          </Button>
        )}
        <p className="text-neutral3 max-w-md">
          你可以随时在智能体的可见性设置中更改此选项，现在添加到库是可选操作。
        </p>
        {dialog}
      </div>
    </AgentStepContainer>
  );
};
