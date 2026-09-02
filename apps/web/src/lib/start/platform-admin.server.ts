import { getServerRpc } from "@/lib/start/server-rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";

export type PlatformAdminState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ready" };

export async function getPlatformAdminStateFromRequest(): Promise<PlatformAdminState> {
  return await rpcFetch(
    getServerRpc().api.session["platform-admin"].$get(),
    "加载平台管理员状态失败",
  );
}
