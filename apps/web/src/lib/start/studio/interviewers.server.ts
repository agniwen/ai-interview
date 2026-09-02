import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioInterviewersData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  return await rpcFetch(
    rpc.api.w[":slug"].studio.interviewers.bootstrap.$get({ param: { slug } }),
    "加载面试官页数据失败",
  );
}
