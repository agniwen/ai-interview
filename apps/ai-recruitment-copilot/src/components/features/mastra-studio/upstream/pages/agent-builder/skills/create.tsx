import { Button } from "@mastra/playground-ui/components/Button";
import { ArrowLeftIcon } from "lucide-react";
import { Navigate, useNavigate } from "@/components/features/mastra-studio/router/compat";
import { SkillBuilderStarter } from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/skill-starter/skill-builder-starter";
import { useBuilderSettings } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-settings";
import { useStoredSkills } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-skills";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useStoredWorkspaces } from "@/components/features/mastra-studio/upstream/domains/workspace/hooks/use-stored-workspaces";

export default function AgentBuilderSkillsCreate() {
  const { hasPermission, rbacEnabled } = usePermissions();
  const canWrite = !rbacEnabled || hasPermission("stored-skills:write");
  // Warm caches the edit page needs on first paint.
  useStoredSkills({ enabled: canWrite });
  useStoredWorkspaces();
  useBuilderSettings();
  const navigate = useNavigate();

  if (!canWrite) {
    return <Navigate to="/agent-builder/skills" replace />;
  }
  return (
    <>
      <div className="absolute top-3 left-3 md:top-6 md:left-6 z-10">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() =>
            navigate("/agent-builder/skills", {
              viewTransition: true,
            })
          }
          className="rounded-full"
          tooltip="Skills list"
        >
          <ArrowLeftIcon />
        </Button>
      </div>
      <SkillBuilderStarter />
    </>
  );
}
