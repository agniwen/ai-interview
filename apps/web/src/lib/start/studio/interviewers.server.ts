import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioInterviewersData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  const { records } = await rpcFetch(
    rpc.api.w[":slug"].studio.departments.all.$get({ param: { slug } }),
    "加载部门列表失败",
  );
  return {
    departments: records,
  };
}
