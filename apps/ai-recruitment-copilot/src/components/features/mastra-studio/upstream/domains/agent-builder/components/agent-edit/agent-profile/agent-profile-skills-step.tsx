import { Button } from "@mastra/playground-ui/components/Button";
import { Icon } from "@mastra/playground-ui/icons/Icon";

import { ArrowRightIcon } from "lucide-react";
import { AgentStepContainer } from "./agent-step-container";
import { Skills } from "./skills";
import { useEditPage } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/edit-page-context";
import { useStreamRunning } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/stream-chat-context";
import { useWizard } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/wizard-context";
import { startViewTransition } from "@/components/features/mastra-studio/upstream/lib/routing";

export const AgentProfileSkillsStep = () => {
  const { availableSkills } = useEditPage();
  const { next } = useWizard();
  const isStreaming = useStreamRunning();

  const handleContinue = () => {
    startViewTransition(() => {
      next();
    });
  };

  return (
    <AgentStepContainer
      title="技能"
      cta={
        <Button onClick={handleContinue} disabled={isStreaming}>
          继续{" "}
          <Icon>
            <ArrowRightIcon />
          </Icon>
        </Button>
      }
    >
      <Skills availableSkills={availableSkills} editable={!isStreaming} />
    </AgentStepContainer>
  );
};
