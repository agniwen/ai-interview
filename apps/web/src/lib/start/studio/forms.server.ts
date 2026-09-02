import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioFormsData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  return await rpcFetch(
    rpc.api.w[":slug"].studio.forms.bootstrap.$get({ param: { slug } }),
    "加载表单页数据失败",
  );
}
