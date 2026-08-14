import { Button } from "@mastra/playground-ui/components/Button";
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { PlatformIcon } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-channels/platform-icons";
import { useConnectChannelAction } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-channels";
import type {
  ChannelInstallationInfo,
  ChannelPlatformInfo,
} from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-channels";

interface PlatformCopy {
  description: (platformName: string) => string;
  notConfigured: (platformName: string) => string;
  notConnected: (platformName: string) => string;
  connectLabel: string;
  /** When true, only installations with status === 'active' count as connected. */
  requireActiveInstallation?: boolean;
}

const DEFAULT_COPY: PlatformCopy = {
  connectLabel: "连接",
  description: (name) => `管理此智能体与 ${name} 的连接。`,
  notConfigured: () => "服务器尚未配置此平台。",
  notConnected: (name) => `将此智能体发布到 ${name}。`,
};

const PLATFORM_COPY: Record<string, Partial<PlatformCopy>> = {
  slack: {
    connectLabel: "使用 Slack 继续",
    description: () => "管理此智能体的 Slack 连接。",
    notConfigured: () => "服务器尚未配置 Slack。",
    notConnected: () => "你将跳转到 Slack，选择工作区并授权所需权限。",
    requireActiveInstallation: true,
  },
};

function copyFor(platformId: string): PlatformCopy {
  return { ...DEFAULT_COPY, ...PLATFORM_COPY[platformId] };
}

export interface PublishChannelContentProps {
  platform: ChannelPlatformInfo;
  agentId: string;
  installation?: ChannelInstallationInfo;
  onClose: () => void;
  onDisconnectRequest: () => void;
}

export function PublishChannelContent({
  platform,
  agentId,
  installation,
  onClose,
  onDisconnectRequest,
}: PublishChannelContentProps) {
  const { connect, isConnecting } = useConnectChannelAction(platform.id, { onClose });
  const copy = copyFor(platform.id);
  const activeInstallation =
    copy.requireActiveInstallation && installation?.status !== "active" ? undefined : installation;

  const handleConnect = () => {
    connect(agentId);
  };

  let statusContent;
  if (platform.isConfigured) {
    statusContent = activeInstallation ? (
      <>
        已将 <span className="text-neutral6">{platform.name}</span> 连接到{" "}
        <span className="text-neutral6">Mastra</span>
      </>
    ) : (
      copy.notConnected(platform.name)
    );
  } else {
    statusContent = copy.notConfigured(platform.name);
  }

  let footerAction;
  if (platform.isConfigured) {
    footerAction = activeInstallation ? (
      <Button
        variant="default"
        onClick={onDisconnectRequest}
        data-testid={`publish-channel-dialog-${platform.id}-disconnect`}
      >
        断开连接
      </Button>
    ) : (
      <Button
        variant="default"
        onClick={handleConnect}
        disabled={isConnecting}
        data-testid={`publish-channel-dialog-${platform.id}-connect`}
      >
        {isConnecting ? "正在连接…" : copy.connectLabel}
      </Button>
    );
  } else {
    footerAction = (
      <Button variant="default" onClick={onClose}>
        关闭
      </Button>
    );
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <PlatformIcon platform={platform.id} className="h-8 w-8 shrink-0" />
          <DialogTitle>{platform.name} 集成</DialogTitle>
        </div>

        <DialogDescription>{copy.description(platform.name)}</DialogDescription>
      </DialogHeader>

      <DialogBody>
        <Txt variant="ui-sm" className="text-neutral3">
          {statusContent}
        </Txt>
      </DialogBody>

      <DialogFooter>{footerAction}</DialogFooter>
    </>
  );
}
