import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

export async function loadStudioInterviewQuestionsData({ slug }: { slug: string }) {
  const rpc = getServerRpc();
  const { records } = await rpcFetch(
    rpc.api.w[":slug"].studio["job-descriptions"].all.$get({ param: { slug } }),
    "加载岗位列表失败",
  );
  return {
    jobDescriptions: records,
  };
}
