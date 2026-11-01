import { createFileRoute, redirect } from "@tanstack/react-router";

// 部门管理已并入岗位设置页左侧的部门栏；保留旧地址以免书签和外部链接失效。
// Department management now lives in the job settings rail; keep the old URL working.
export const Route = createFileRoute("/w/$slug/studio/departments")({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { slug: params.slug },
      replace: true,
      to: "/w/$slug/studio/job-descriptions",
    });
  },
});
