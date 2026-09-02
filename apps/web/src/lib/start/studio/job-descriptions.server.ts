import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioJobDescriptionsData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  return await rpcFetch(
    rpc.api.w[":slug"].studio["job-descriptions"].bootstrap.$get({ param: { slug } }),
    "加载岗位页数据失败",
  );
}
