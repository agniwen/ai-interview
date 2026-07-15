import { Button } from "@mastra/playground-ui/components/Button";
import { StatusBadge } from "@mastra/playground-ui/components/StatusBadge";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { useState } from "react";
import { ChannelDialog } from "./publish-channel-dialogs";
import { PlatformIcon } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-channels/platform-icons";
import {
  useChannelInstallations,
  useChannelPlatforms,
  useConnectChannelAction,
} from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-channels";

export interface ConnectChannelMessageProps {
  platformId: string;
  agentId: string | undefined;
}

export function ConnectChannelMessage({ platformId, agentId }: ConnectChannelMessageProps) {
  const { data: platforms = [], isLoading: arePlatformsLoading } = useChannelPlatforms();
  const platform = platforms.find((p) => p.id === platformId);
  const { data: installations = [] } = useChannelInstallations(platformId, agentId ?? "");
  const installation = installations.find((i) => i.status === "active");
  const { connect, isConnecting } = useConnectChannelAction(platformId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!agentId || arePlatformsLoading || !platform) {
    return null;
  }

  const handleConnect = () => {
    connect(agentId);
  };

  let statusBadge = null;
  if (platform.isConfigured) {
    if (installation) {
      statusBadge = (
        <StatusBadge variant="success" size="sm">
          已连接
        </StatusBadge>
      );
    }
  } else {
    statusBadge = (
      <StatusBadge variant="warning" size="sm">
        未配置
      </StatusBadge>
    );
  }

  let actionButton;
  if (platform.isConfigured) {
    if (installation) {
      actionButton = (
        <Button
          size="sm"
          variant="default"
          onClick={() => setDialogOpen(true)}
          data-testid={`agent-builder-chat-connect-channel-${platformId}-button`}
        >
          管理
        </Button>
      );
    } else {
      let connectLabel = `连接 ${platform.name}`;
      if (platformId === "slack") {
        connectLabel = "使用 Slack 继续";
      }
      if (isConnecting) {
        connectLabel = "正在连接…";
      }
      actionButton = (
        <Button
          size="sm"
          variant="default"
          onClick={handleConnect}
          disabled={isConnecting}
          data-testid={`agent-builder-chat-connect-channel-${platformId}-button`}
        >
          {connectLabel}
        </Button>
      );
    }
  } else {
    actionButton = (
      <Button
        size="sm"
        variant="ghost"
        disabled
        data-testid={`agent-builder-chat-connect-channel-${platformId}-button`}
      >
        未配置
      </Button>
    );
  }

  return (
    <>
      <div
        className="border border-1 p-3 rounded-xl flex items-center gap-3"
        data-testid={`agent-builder-chat-connect-channel-${platformId}`}
      >
        <PlatformIcon platform={platform.id} className="h-5 w-5 shrink-0" />
        <Txt variant="ui-md" className="flex-1 text-neutral4" as="div">
          {platform.name}
        </Txt>
        {statusBadge}
        {actionButton}
      </div>

      {dialogOpen ? (
        <ChannelDialog
          platform={platform}
          agentId={agentId}
          installation={installation}
          open
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </>
  );
}
