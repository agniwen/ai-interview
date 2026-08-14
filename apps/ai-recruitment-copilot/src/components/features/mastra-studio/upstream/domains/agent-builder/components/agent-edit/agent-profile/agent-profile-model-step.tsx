import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { Icon } from "@mastra/playground-ui/icons/Icon";

import { ArrowRightIcon } from "lucide-react";
import { useWatch } from "react-hook-form";
import { AgentStepContainer } from "./agent-step-container";
import { Models } from "./models";
import { useStreamRunning } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/stream-chat-context";
import { useWizard } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/wizard-context";
import { ProviderLogo } from "@/components/features/mastra-studio/upstream/domains/llm/components/provider-logo";
import { cleanProviderId } from "@/components/features/mastra-studio/upstream/domains/llm/utils";
import { startViewTransition } from "@/components/features/mastra-studio/upstream/lib/routing";

interface ActiveModelBadgeProps {
  provider: string;
  name: string;
}
const ActiveModelBadge = ({ provider, name }: ActiveModelBadgeProps) => {
  const providerId = cleanProviderId(provider);
  return (
    <Badge variant="default">
      <ProviderLogo providerId={providerId} size={16} /> {providerId}/{name}
    </Badge>
  );
};

export const AgentProfileModelStep = () => {
  const { next } = useWizard();
  const isStreaming = useStreamRunning();
  const model = useWatch({ name: "model" });

  const handleContinue = () => {
    startViewTransition(() => {
      next();
    });
  };

  return (
    <AgentStepContainer
      title="可用模型"
      description={
        model ? (
          <div className="flex items-center gap-2">
            已选模型：
            <ActiveModelBadge provider={model.provider} name={model.name} />
          </div>
        ) : undefined
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
      <Models editable={!isStreaming} />
    </AgentStepContainer>
  );
};
