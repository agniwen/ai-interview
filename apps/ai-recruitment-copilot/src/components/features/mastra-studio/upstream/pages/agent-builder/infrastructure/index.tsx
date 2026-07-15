import type { InfrastructureStatusResponse } from "@mastra/client-js";
import { PageHeader } from "@mastra/playground-ui/components/PageHeader";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { SectionCard } from "@mastra/playground-ui/components/SectionCard";
import { Txt } from "@mastra/playground-ui/components/Txt";

import { useInfrastructureStatus } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-infrastructure-status";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";

const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
      ok ? "bg-accent3/10 text-accent3" : "bg-surface2 text-neutral3"
    }`}
    data-slot="infrastructure-status-badge"
    data-ok={ok ? "true" : "false"}
  >
    <span
      className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-accent3" : "bg-neutral3"}`}
      aria-hidden="true"
    />
    {label}
  </span>
);

const EmptyRow = ({ message }: { message: string }) => (
  <Txt variant="ui-sm" className="text-neutral3">
    {message}
  </Txt>
);

const titleCase = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return value;
  }
  return String(value)
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
};

const Detail = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div className="flex flex-col gap-0.5">
    <Txt variant="ui-xs" className="text-neutral4">
      {label}
    </Txt>
    <Txt variant="ui-sm" className="text-icon6">
      {value ?? "未设置"}
    </Txt>
  </div>
);

const ConfigDetails = ({ entries }: { entries: { key: string; value: string }[] }) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border1 pt-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <Detail key={entry.key} label={`配置：${entry.key}`} value={titleCase(entry.value)} />
      ))}
    </div>
  );
};

export const AgentBuilderInfrastructure = () => {
  const { hasPermission } = usePermissions();
  const canViewInfrastructure = hasPermission("infrastructure:read");
  const {
    data: infrastructureData,
    isLoading,
    error,
  } = useInfrastructureStatus({ enabled: canViewInfrastructure });
  const data = infrastructureData as InfrastructureStatusResponse | undefined;

  return (
    <PageLayout width="narrow">
      <PageLayout.TopArea>
        <PageHeader>
          <PageHeader.Title>基础设施</PageHeader.Title>
        </PageHeader>
      </PageLayout.TopArea>

      <PageLayout.MainArea className="flex flex-col gap-5 mt-6">
        <SectionCard
          title="智能体构建器基础设施"
          description="用户创建或运行构建器智能体时，智能体构建器所应用的部署级默认配置。"
        >
          {(() => {
            if (!canViewInfrastructure) {
              return (
                <Txt variant="ui-sm" className="text-neutral3">
                  你没有查看智能体构建器基础设施的权限。
                </Txt>
              );
            }
            if (isLoading) {
              return (
                <Txt variant="ui-sm" className="text-neutral3">
                  正在加载基础设施配置…
                </Txt>
              );
            }
            if (error || !data) {
              return (
                <Txt variant="ui-sm" className="text-neutral3">
                  基础设施配置不可用。
                </Txt>
              );
            }
            return (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Txt variant="ui-md" className="font-medium">
                      渠道
                    </Txt>
                    <Txt variant="ui-xs" className="text-neutral3">
                      可用于智能体构建器发布和共享流程的渠道提供商。尚未配置的提供商会被省略，
                      直至所需环境或配置就绪。
                    </Txt>
                  </div>
                  {data.channels.providers.length === 0 ? (
                    <EmptyRow message="智能体构建器暂无已配置的渠道提供商。" />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {data.channels.providers.map((provider) => (
                        <li
                          key={provider.id}
                          className="rounded-md border border-border1 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1">
                              <Txt variant="ui-sm" className="font-medium">
                                {titleCase(provider.name)}
                              </Txt>
                              <Txt variant="ui-xs" className="text-neutral3">
                                提供商 ID：{provider.id}
                              </Txt>
                            </div>
                            <StatusBadge
                              ok={provider.isConfigured}
                              label={provider.isConfigured ? "已配置" : "未配置"}
                            />
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border1 pt-3 sm:grid-cols-2">
                            <Detail label="注册方" value={`${titleCase(provider.name)} 提供商`} />
                            <Detail label="提供商路由" value={provider.routeCount} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Txt variant="ui-md" className="font-medium">
                      浏览器
                    </Txt>
                    <Txt variant="ui-xs" className="text-neutral3">
                      为构建器智能体配置的浏览器自动化提供商。卡片会显示所选提供商，
                      以及配置中显式传入的非默认选项。
                    </Txt>
                  </div>
                  {data.browser.provider ? (
                    <div className="rounded-md border border-border1 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <Txt variant="ui-sm" className="font-medium">
                            {titleCase(data.browser.provider)}
                          </Txt>
                        </div>
                        <StatusBadge
                          ok={data.browser.registered}
                          label={data.browser.registered ? "提供商可用" : "缺少提供商"}
                        />
                      </div>
                      {data.browser.env ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border1 pt-3 sm:grid-cols-2">
                          <Detail label="环境" value={titleCase(data.browser.env)} />
                        </div>
                      ) : null}
                      <ConfigDetails entries={data.browser.config} />
                    </div>
                  ) : (
                    <EmptyRow message="尚未配置浏览器。" />
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Txt variant="ui-md" className="font-medium">
                      注册表
                    </Txt>
                    <Txt variant="ui-xs" className="text-neutral3">
                      可将技能导入工作区的外部技能注册表。
                    </Txt>
                  </div>
                  <div className="rounded-md border border-border1 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <Txt variant="ui-sm" className="font-medium">
                          skills.sh
                        </Txt>
                        <Txt variant="ui-xs" className="text-neutral3">
                          由 GitHub 支持的公共技能注册表。
                        </Txt>
                      </div>
                      <StatusBadge
                        ok={data.registries?.skillsSh?.enabled ?? false}
                        label={data.registries?.skillsSh?.enabled ? "已启用" : "已停用"}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <Txt variant="ui-md" className="font-medium">
                      工作区
                    </Txt>
                    <Txt variant="ui-xs" className="text-neutral3">
                      用于生成文件和沙箱执行的工作区配置。此处仅显示构建器工作区，
                      不包含智能体专属的运行时工作区。
                    </Txt>
                  </div>
                  {data.workspace.type ? (
                    <div className="rounded-md border border-border1 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <Txt variant="ui-sm" className="font-medium">
                          {data.workspace.workspaceId ?? data.workspace.name ?? "内联工作区"}
                        </Txt>
                        <div className="flex gap-2">
                          <StatusBadge ok={data.workspace.hasFilesystem} label="文件系统" />
                          <StatusBadge ok={data.workspace.hasSandbox} label="沙箱" />
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border1 pt-3 sm:grid-cols-2">
                        <Detail
                          label="配置类型"
                          value={data.workspace.type === "id" ? "已注册工作区" : "内联配置"}
                        />
                        {data.workspace.workspaceId ? (
                          <Detail label="工作区 ID" value={data.workspace.workspaceId} />
                        ) : null}
                        <Detail label="名称" value={data.workspace.name} />
                        <Detail
                          label="文件系统提供商"
                          value={titleCase(data.workspace.filesystemProvider)}
                        />
                        <Detail
                          label="沙箱提供商"
                          value={titleCase(data.workspace.sandboxProvider)}
                        />
                      </div>
                      <ConfigDetails entries={data.workspace.config} />
                    </div>
                  ) : (
                    <EmptyRow message="尚未配置工作区。" />
                  )}
                </div>
              </div>
            );
          })()}
        </SectionCard>
      </PageLayout.MainArea>
    </PageLayout>
  );
};

export default AgentBuilderInfrastructure;
