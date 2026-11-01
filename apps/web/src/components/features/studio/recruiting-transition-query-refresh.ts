import type { QueryClient } from "@tanstack/react-query";

/** 阶段变化会同步失效节点证据和当前 Offer，相关详情缓存必须一起刷新。 */
export function invalidateRecruitingTransitionQueries(
  queryClient: QueryClient,
  slug: string,
  recordId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["studio-resumes"] }),
    queryClient.invalidateQueries({
      queryKey: ["studio-resumes", slug, "detail", recordId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["studio-resumes", slug, "timeline", recordId],
    }),
    queryClient.invalidateQueries({ queryKey: ["offer-drafts", slug, recordId] }),
  ]);
}
