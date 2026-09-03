import type { GlobalConfigRecord } from "@app/shared/global-config";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export function loadStudioGlobalConfigInitial(slug: string): Promise<GlobalConfigRecord> {
  const rpc = getServerRpc();
  return rpcFetch(
    rpc.api.w[":slug"].studio["global-config"].$get({ param: { slug } }),
    "加载全局配置失败",
  );
}
