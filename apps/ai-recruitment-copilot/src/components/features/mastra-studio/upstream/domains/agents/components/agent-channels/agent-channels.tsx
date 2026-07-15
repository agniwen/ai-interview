import { Button } from "@mastra/playground-ui/components/Button";
import { DataList, DataListSkeleton } from "@mastra/playground-ui/components/DataList";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { StatusBadge } from "@mastra/playground-ui/components/StatusBadge";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMemo, useState } from "react";
import {
  useChannelPlatforms,
  useChannelInstallations,
  useConnectChannelAction,
  useDisconnectChannel,
} from "../../hooks/use-channels";
import type { ChannelPlatformInfo } from "../../hooks/use-channels";
import { PlatformIcon } from "./platform-icons";
import { resolveConditional } from "../../utils/conditional";
import { isTruthy } from "../../utils/truthiness";

const COLUMNS = "1fr auto auto";

export interface AgentChannelsProps {
  agentId: string;
}

function ChannelRow({ platform, agentId }: ChannelRowProps) {
  const { data: installations, isLoading } = useChannelInstallations(platform.id, agentId);
  const { connect, isConnecting } = useConnectChannelAction(platform.id);
  const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectChannel(platform.id);

  const activeInstallation = installations?.find((i) => i.status === "active");

  const handleConnect = () => {
    connect(agentId);
  };

  const handleDisconnect = () => {
    disconnect(agentId, {
      onError: (err: Error & { body?: { error?: string } }) => {
        toast.error(err.body?.error || err.message || "断开渠道连接失败");
      },
    });
  };

  return (
    <DataList.RowStatic>
      <DataList.Cell className="text-left text-neutral4">
        <span className="flex items-center gap-3 min-w-0">
          <PlatformIcon platform={platform.id} className="h-5 w-5 shrink-0" />
          <span className="flex flex-col min-w-0">
            <span className="truncate">{platform.name}</span>
            {activeInstallation ? (
              <Txt variant="ui-xs" className="text-neutral5 truncate">
                {activeInstallation.displayName || "工作区"}
              </Txt>
            ) : null}
          </span>
        </span>
      </DataList.Cell>

      <DataList.Cell className="flex justify-end">
        {resolveConditional(
          isLoading,
          () => null,
          () =>
            resolveConditional(
              activeInstallation,
              () => (
                <StatusBadge variant="success" size="sm">
                  已连接
                </StatusBadge>
              ),
              () =>
                isTruthy(!platform.isConfigured) ? (
                  <StatusBadge variant="warning" size="sm">
                    未配置
                  </StatusBadge>
                ) : null,
            ),
        )}
      </DataList.Cell>

      <DataList.Cell className="justify-end text-right">
        {resolveConditional(
          isLoading,
          () => null,
          () =>
            resolveConditional(
              activeInstallation,
              () => (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="shrink-0 text-[11px] text-neutral5 hover:text-accent2 transition-colors disabled:opacity-50"
                >
                  {isDisconnecting ? "正在移除…" : "移除"}
                </button>
              ),
              () =>
                platform.isConfigured ? (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleConnect}
                    disabled={isConnecting}
                  >
                    {isConnecting ? "正在连接…" : "连接"}
                  </Button>
                ) : null,
            ),
        )}
      </DataList.Cell>
    </DataList.RowStatic>
  );
}

function ChannelsList({ platforms, isLoading, agentId, search }: ChannelsListProps) {
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return platforms.filter((platform) => platform.name.toLowerCase().includes(term));
  }, [platforms, search]);

  if (isLoading) {
    return <DataListSkeleton columns={COLUMNS} />;
  }

  return (
    <DataList columns={COLUMNS}>
      <DataList.Top>
        <DataList.TopCell className="">平台</DataList.TopCell>
        <DataList.TopCell className="justify-end text-right">状态</DataList.TopCell>
        <DataList.TopCell className="">{""}</DataList.TopCell>
      </DataList.Top>

      {filtered.length === 0 && search ? (
        <DataList.NoMatch message="没有与搜索条件匹配的渠道" />
      ) : null}

      {filtered.map((platform) => (
        <ChannelRow key={platform.id} platform={platform} agentId={agentId} />
      ))}
    </DataList>
  );
}

export const AgentChannels = ({ agentId }: AgentChannelsProps) => {
  const { data: platforms, isLoading } = useChannelPlatforms();
  const [search, setSearch] = useState("");

  if (!isLoading && (!platforms || platforms.length === 0)) {
    return (
      <NoDataPageLayout>
        <Txt variant="ui-sm" className="text-neutral6">
          尚未配置渠道平台。
        </Txt>
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.TopArea>
        <div className="max-w-120">
          <ListSearch onSearch={setSearch} label="筛选渠道" placeholder="按平台名称筛选" />
        </div>
      </PageLayout.TopArea>

      <ChannelsList
        platforms={platforms ?? []}
        isLoading={isLoading}
        agentId={agentId}
        search={search}
      />
    </PageLayout>
  );
};

interface ChannelsListProps {
  platforms: ChannelPlatformInfo[];
  isLoading: boolean;
  agentId: string;
  search: string;
}

interface ChannelRowProps {
  platform: ChannelPlatformInfo;
  agentId: string;
}
