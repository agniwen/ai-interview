import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { Icon } from "@mastra/playground-ui/icons/Icon";

import { ArrowRightIcon } from "lucide-react";
import { AgentStepContainer } from "./agent-step-container";
import { Tools } from "./tools";
import { useEditPage } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/edit-page-context";
import { useStreamRunning } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/stream-chat-context";
import { useWizard } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/wizard-context";
import { startViewTransition } from "@/components/features/mastra-studio/upstream/lib/routing";

export const AgentProfileToolsStep = () => {
  const { availableAgentTools } = useEditPage();
  const { next } = useWizard();
  const isStreaming = useStreamRunning();
  const selectedToolsCount = availableAgentTools.filter((tool) => tool.isChecked).length;

  const handleContinue = () => {
    startViewTransition(() => {
      next();
    });
  };

  return (
    <AgentStepContainer
      title="可用工具"
      description={
        <div className="flex items-center gap-2">
          已选工具：{" "}
          <Badge variant="default">
            <strong className="font-semibold text-neutral6">{selectedToolsCount}</strong>
          </Badge>
        </div>
      }
      contentClassName="overflow-hidden"
      cta={
        <Button onClick={handleContinue} disabled={isStreaming}>
          继续{" "}
          <Icon>
            <ArrowRightIcon />
          </Icon>
        </Button>
      }
    >
      <Tools availableAgentTools={availableAgentTools} editable={!isStreaming} />
    </AgentStepContainer>
  );
};
