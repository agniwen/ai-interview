import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
export const approvalApi = rpc.api.w[":slug"].studio["offer-approvals"];
export const approvalKeys = {
  all: (slug: string) => ["offer-approvals", slug] as const,
  detail: (slug: string, id: string) => ["offer-approvals", slug, "detail", id] as const,
  policy: (slug: string) => ["offer-approvals", slug, "policy"] as const,
  preview: (slug: string, id: string) => ["offer-approvals", slug, "preview", id] as const,
  templateApprovers: (slug: string) => ["offer-approvals", slug, "template-approvers"] as const,
  templates: (slug: string) => ["offer-approvals", slug, "templates"] as const,
};
export const approvalPolling = {
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  retry: 1,
  staleTime: 0,
};
export const approvalDetailOptions = (slug: string, id: string) => ({
  queryFn: () =>
    rpcFetch(approvalApi[":approvalId"].$get({ param: { approvalId: id, slug } }), "加载审批失败"),
  queryKey: approvalKeys.detail(slug, id),
  ...approvalPolling,
});
export type ApprovalDetail = Awaited<
  ReturnType<ReturnType<typeof approvalDetailOptions>["queryFn"]>
>;
