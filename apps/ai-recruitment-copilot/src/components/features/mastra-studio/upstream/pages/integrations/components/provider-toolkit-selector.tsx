import type { ProviderItem, ToolkitItem } from "../types";

interface ProviderToolkitSelectorProps {
  providers: ProviderItem[];
  toolkits: ToolkitItem[];
  providerId: string;
  toolkit: string;
  label: string;
  providersLoading: boolean;
  providersError: unknown;
  toolkitsLoading: boolean;
  toolkitsError: unknown;
  authorizePending: boolean;
  authorizeError: unknown;
  authorizedConnection?: { connectionId: string; status: string };
  onProviderChange: (providerId: string) => void;
  onToolkitChange: (toolkit: string) => void;
  onLabelChange: (label: string) => void;
  onConnect: () => void;
}

export function ProviderToolkitSelector({
  providers,
  toolkits,
  providerId,
  toolkit,
  label,
  providersLoading,
  providersError,
  toolkitsLoading,
  toolkitsError,
  authorizePending,
  authorizeError,
  authorizedConnection,
  onProviderChange,
  onToolkitChange,
  onLabelChange,
  onConnect,
}: ProviderToolkitSelectorProps) {
  return (
    <div className="space-y-4 border rounded p-4">
      <div className="space-y-1">
        <label className="block font-medium" htmlFor="provider-select">
          提供商
        </label>
        <select
          id="provider-select"
          className="border rounded px-2 py-1 w-full"
          value={providerId}
          onChange={(event) => onProviderChange(event.target.value)}
          disabled={providersLoading}
        >
          <option value="">— 选择提供商 —</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.displayName ?? provider.name} ({provider.id})
            </option>
          ))}
        </select>
        {providersLoading && <span className="text-gray-500">正在加载提供商…</span>}
        {providersError ? <span className="text-red-600">{String(providersError)}</span> : null}
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="toolkit-select">
          工具包
        </label>
        <select
          id="toolkit-select"
          className="border rounded px-2 py-1 w-full"
          value={toolkit}
          onChange={(event) => onToolkitChange(event.target.value)}
          disabled={!providerId || toolkitsLoading}
        >
          <option value="">— 选择工具包 —</option>
          {toolkits.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name} ({item.slug})
            </option>
          ))}
        </select>
        {toolkitsLoading && <span className="text-gray-500">正在加载工具包…</span>}
        {toolkitsError ? <span className="text-red-600">{String(toolkitsError)}</span> : null}
      </div>

      <div className="space-y-1">
        <label className="block font-medium" htmlFor="label-input">
          标签（可选）
        </label>
        <input
          id="label-input"
          aria-label="连接标签"
          type="text"
          className="border rounded px-2 py-1 w-full"
          placeholder="我的个人 Gmail"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          disabled={!providerId || !toolkit}
        />
      </div>

      <button
        type="button"
        className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        onClick={onConnect}
        disabled={!providerId || !toolkit || authorizePending}
      >
        {authorizePending ? "正在授权…" : "连接"}
      </button>

      {authorizeError ? <p className="text-red-600">{String(authorizeError)}</p> : null}
      {authorizedConnection && (
        <p className="text-green-700">
          已授权：{authorizedConnection.connectionId}（状态：{authorizedConnection.status}）
        </p>
      )}
    </div>
  );
}
