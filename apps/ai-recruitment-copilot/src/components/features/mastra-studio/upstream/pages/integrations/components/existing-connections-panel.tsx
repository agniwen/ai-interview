import type { ConnectionItem, GroupedConnections } from "../types";

function ConnectionRow({
  connection,
  isAdmin,
  disconnectPending,
  onDisconnect,
}: {
  connection: ConnectionItem;
  isAdmin: boolean;
  disconnectPending: boolean;
  onDisconnect: () => void;
}) {
  return (
    <li className="flex items-center justify-between border-b py-2">
      <div>
        <div className="font-mono text-xs">{connection.connectionId}</div>
        <div className="text-xs text-gray-500">
          {connection.label ?? "（无标签）"} · {connection.status}
          {connection.scope ? ` · ${connection.scope}` : ""}
          {isAdmin && connection.authorId ? ` · 所有者：${connection.authorId}` : ""}
        </div>
      </div>
      <button
        type="button"
        className="text-red-600 underline disabled:opacity-50"
        onClick={onDisconnect}
        disabled={disconnectPending}
      >
        断开连接
      </button>
    </li>
  );
}

function ConnectionList({
  connections,
  isAdmin,
  disconnectPending,
  onDisconnect,
}: {
  connections: ConnectionItem[];
  isAdmin: boolean;
  disconnectPending: boolean;
  onDisconnect: (connectionId: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {connections.map((connection) => (
        <ConnectionRow
          key={connection.connectionId}
          connection={connection}
          isAdmin={isAdmin}
          disconnectPending={disconnectPending}
          onDisconnect={() => onDisconnect(connection.connectionId)}
        />
      ))}
    </ul>
  );
}

function ConnectionGroups({
  groups,
  isAdmin,
  disconnectPending,
  onDisconnect,
}: {
  groups: GroupedConnections;
  isAdmin: boolean;
  disconnectPending: boolean;
  onDisconnect: (connectionId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {groups.map(([authorKey, rows]) => (
        <div key={authorKey}>
          <h3
            className="text-sm font-semibold text-gray-700"
            data-testid={`integration-author-group-${authorKey}`}
          >
            {authorKey === "shared" ? "共享" : `由 ${authorKey} 所有`}
          </h3>
          <ConnectionList
            connections={rows}
            isAdmin={isAdmin}
            disconnectPending={disconnectPending}
            onDisconnect={onDisconnect}
          />
        </div>
      ))}
    </div>
  );
}

interface ExistingConnectionsPanelProps {
  providerId: string;
  toolkit: string;
  connections: ConnectionItem[];
  groupedByAuthor: GroupedConnections | null;
  isAdmin: boolean;
  isLoading: boolean;
  error: unknown;
  disconnectPending: boolean;
  disconnectError: unknown;
  onDisconnect: (connectionId: string) => void;
}

function ConnectionsContent({
  connections,
  disconnectPending,
  error,
  groupedByAuthor,
  isAdmin,
  isLoading,
  onDisconnect,
  providerId,
  toolkit,
}: Omit<ExistingConnectionsPanelProps, "disconnectError">) {
  if (!providerId || !toolkit) {
    return <p className="text-gray-500">请选择提供商和工具包以查看连接。</p>;
  }
  if (isLoading) {
    return <p className="text-gray-500">正在加载…</p>;
  }
  if (error) {
    return <p className="text-red-600">{String(error)}</p>;
  }
  if (connections.length === 0) {
    return <p className="text-gray-500">暂无连接。</p>;
  }
  if (groupedByAuthor) {
    return (
      <ConnectionGroups
        groups={groupedByAuthor}
        isAdmin={isAdmin}
        disconnectPending={disconnectPending}
        onDisconnect={onDisconnect}
      />
    );
  }
  return (
    <ConnectionList
      connections={connections}
      isAdmin={isAdmin}
      disconnectPending={disconnectPending}
      onDisconnect={onDisconnect}
    />
  );
}

export function ExistingConnectionsPanel({
  providerId,
  toolkit,
  connections,
  groupedByAuthor,
  isAdmin,
  isLoading,
  error,
  disconnectPending,
  disconnectError,
  onDisconnect,
}: ExistingConnectionsPanelProps) {
  return (
    <div className="space-y-2 border rounded p-4">
      <h2 className="text-lg font-semibold">现有连接</h2>
      <ConnectionsContent
        connections={connections}
        disconnectPending={disconnectPending}
        error={error}
        groupedByAuthor={groupedByAuthor}
        isAdmin={isAdmin}
        isLoading={isLoading}
        onDisconnect={onDisconnect}
        providerId={providerId}
        toolkit={toolkit}
      />
      {disconnectError ? <p className="text-red-600">{String(disconnectError)}</p> : null}
    </div>
  );
}
