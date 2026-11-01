import { createFileRoute, redirect } from "@tanstack/react-router";
import { coerceSearchParams } from "@/lib/client/data-grid-search";

// 表单题已并入「面试题配置」；保留旧地址并带上查询参数（如 templateId 深链）。
// Forms moved into the question bank page; keep the old URL and its query (e.g. templateId).
export const Route = createFileRoute("/w/$slug/studio/forms")({
  validateSearch: coerceSearchParams,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      params: { slug: params.slug },
      replace: true,
      search,
      to: "/w/$slug/studio/question-bank/forms",
    });
  },
});
