import { Button } from "@mastra/playground-ui/components/Button";
import { TooltipProvider } from "@mastra/playground-ui/components/Tooltip";
import { useCopyToClipboard } from "@mastra/playground-ui/hooks/use-copy-to-clipboard";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Check, Link as LinkIcon, Pencil, SlidersHorizontal, X } from "lucide-react";
import {
  MASTRA_STUDIO_ROUTE_BASE,
  useLocation,
  useNavigate,
} from "@/components/features/mastra-studio/router/compat";

import { useAgent } from "../hooks/use-agent";
import { AgentEntityHeader } from "./agent-entity-header";
import { useCanCreateAgent } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-can-create-agent";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface AgentViewHeaderProps {
  agentId: string;
  view: "chat" | "settings";
}

export function AgentViewHeader({ agentId, view }: AgentViewHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: agent } = useAgent(agentId);
  const { canCreateAgent } = useCanCreateAgent();
  const { Link: FrameworkLink, paths } = useLinkComponent();

  const sessionUrl = `${window.location.origin}${MASTRA_STUDIO_ROUTE_BASE}/agents/${encodeURIComponent(agentId)}/session`;
  const { handleCopy: handleShareLink, isCopied: isShareCopied } = useCopyToClipboard({
    copyMessage: "会话 URL 已复制到剪贴板！",
    text: sessionUrl,
  });

  const isStoredAgent = agent?.source === "stored";
  const editPath = paths.cmsAgentEditLink(agentId);
  const showEditButton = canCreateAgent && isStoredAgent && Boolean(editPath);

  const handleToggle = () => {
    if (view === "chat") {
      void navigate(`/agents/${agentId}/settings`, {
        state: { from: `${location.pathname}${location.search}` },
        viewTransition: true,
      });
      return;
    }

    const from = (location.state as { from?: string } | null)?.from;
    void navigate(from ?? `/agents/${agentId}/chat/new`, { viewTransition: true });
  };

  return (
    <TooltipProvider>
      <div
        className="flex items-center justify-between gap-2 pr-3 max-lg:py-2"
        style={{ viewTransitionName: "agent-view-header" }}
      >
        <div className="flex-1 min-w-0 max-lg:hidden">
          <AgentEntityHeader agentId={agentId} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {showEditButton && (
            <Button variant="outline" size="sm" as={FrameworkLink} to={editPath}>
              <Icon size="sm">
                <Pencil />
              </Icon>
              编辑
            </Button>
          )}
          <Button
            variant="default"
            type="button"
            onClick={handleShareLink}
            tooltip="复制会话 URL 并与团队共享"
            data-testid="agent-entity-header-share"
          >
            {isShareCopied ? (
              <Check className="h-4 w-4 text-neutral3" />
            ) : (
              <LinkIcon className="h-4 w-4 text-neutral3 hover:text-neutral6" />
            )}
          </Button>
          <Button
            variant="default"
            type="button"
            onClick={handleToggle}
            data-testid="agent-view-header-toggle"
          >
            {view === "chat" ? (
              <>
                <SlidersHorizontal className="h-4 w-4 text-neutral3" /> 设置
              </>
            ) : (
              <>
                <X className="h-4 w-4 text-neutral3" /> 关闭
              </>
            )}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
