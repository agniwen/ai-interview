import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioInterviewQuestionsData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  return await rpcFetch(
    rpc.api.w[":slug"].studio["interview-questions"].bootstrap.$get({ param: { slug } }),
    "加载沟通题页数据失败",
  );
}
