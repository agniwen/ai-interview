import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useState } from "react";
import { McpServersList } from "@/components/features/mastra-studio/upstream/domains/mcps/components/mcps-list/mcps-list";
import { NoMCPServersInfo } from "@/components/features/mastra-studio/upstream/domains/mcps/components/mcps-list/no-mcp-servers-info";
import { useMCPServers } from "@/components/features/mastra-studio/upstream/domains/mcps/hooks/use-mcp-servers";

const MCPs = () => {
  const { data: mcpServers = [], isLoading, error } = useMCPServers();
  const [search, setSearch] = useState("");

  if (error && is401UnauthorizedError(error)) {
    return (
      <NoDataPageLayout>
        <SessionExpired />
      </NoDataPageLayout>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <NoDataPageLayout>
        <PermissionDenied resource="MCP 服务器" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="加载 MCP 服务器失败" message={error.message} />
      </NoDataPageLayout>
    );
  }

  if (mcpServers.length === 0 && !isLoading) {
    return (
      <NoDataPageLayout>
        <NoMCPServersInfo />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout>
      <PageLayout.TopArea>
        <div className="max-w-120">
          <ListSearch onSearch={setSearch} label="筛选 MCP 服务器" placeholder="按名称筛选" />
        </div>
      </PageLayout.TopArea>

      <McpServersList mcpServers={mcpServers} isLoading={isLoading} search={search} />
    </PageLayout>
  );
};

export default MCPs;
