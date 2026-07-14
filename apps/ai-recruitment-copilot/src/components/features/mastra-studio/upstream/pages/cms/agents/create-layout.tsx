import { Button } from "@mastra/playground-ui/components/Button";
import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Check } from "lucide-react";
import { Outlet, useLocation } from "@/components/features/mastra-studio/router/compat";
import { AgentCmsFormShell } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-cms-form-shell";
import { useAgentCmsForm } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent-cms-form";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { RouteHeaderActions } from "@/components/features/mastra-studio/upstream/lib/route-header";

function CreateLayoutWrapper() {
  const { navigate, paths } = useLinkComponent();
  const location = useLocation();

  const { form, handlePublish, isSubmitting, canPublish } = useAgentCmsForm({
    mode: "create",
    onSuccess: (agentId) => navigate(paths.agentLink(agentId)),
  });

  return (
    <MainContentLayout>
      <RouteHeaderActions owner="cms-agent-create">
        <Button
          variant="primary"
          onClick={() => void handlePublish()}
          disabled={isSubmitting || !canPublish}
        >
          {isSubmitting ? (
            <>
              <Spinner className="h-4 w-4" />
              Creating...
            </>
          ) : (
            <>
              <Icon>
                <Check />
              </Icon>
              Create agent
            </>
          )}
        </Button>
      </RouteHeaderActions>
      <AgentCmsFormShell
        form={form}
        mode="create"
        isSubmitting={isSubmitting}
        handlePublish={handlePublish}
        basePath="/cms/agents/create"
        currentPath={location.pathname}
      >
        <Outlet />
      </AgentCmsFormShell>
    </MainContentLayout>
  );
}

export { CreateLayoutWrapper };
