import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioJobDescriptionsData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  const [departments, interviewers, metrics] = await Promise.all([
    rpcFetch(
      rpc.api.w[":slug"].studio.departments.all.$get({ param: { slug } }),
      "加载部门列表失败",
    ).then(({ records }) => records),
    rpcFetch(
      rpc.api.w[":slug"].studio.interviewers.all.$get({ param: { slug } }),
      "加载面试官列表失败",
    ).then(({ records }) => records),
    rpcFetch(
      rpc.api.w[":slug"].studio["job-descriptions"].metrics.$get({ param: { slug } }),
      "加载岗位指标失败",
    ),
  ]);

  return {
    departments,
    interviewers,
    metrics,
  };
}
