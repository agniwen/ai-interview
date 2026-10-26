import { createFileRoute, redirect } from "@tanstack/react-router";
import { coerceSearchParams } from "@/lib/client/data-grid-search";

// 沟通题已并入「面试题配置」；保留旧地址并带上查询参数（如 templateId 深链）。
// Interview questions moved into the question bank page; keep the old URL and its query.
export const Route = createFileRoute("/w/$slug/studio/interview-questions")({
  validateSearch: coerceSearchParams,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      params: { slug: params.slug },
      replace: true,
      search,
      to: "/w/$slug/studio/question-bank/interview-questions",
    });
  },
});
