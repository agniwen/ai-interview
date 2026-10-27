import type { ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
import { EditorPageHeader } from "../editor-page-header";
import { EditorPageSkeleton } from "../editor-page-surface";
import { JobDescriptionFormDialog } from "./job-description-form-dialog";

type ReferenceProps = Pick<
  ComponentProps<typeof JobDescriptionFormDialog>,
  "departments" | "interviewers"
>;
export function JobDescriptionEditPage({
  jobId,
  onBack,
  departments,
  interviewers,
}: ReferenceProps & { jobId: string; onBack: () => void }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = useHasPermission("jd", "update");
  const query = useQuery({
    enabled: canEdit,
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio["job-descriptions"][":id"].$get({ param: { id: jobId, slug } }),
        "加载岗位失败",
        { allow404: true },
      ),
    queryKey: ["job-descriptions", slug, "edit", jobId],
    // A refetch must not reset a dirty form; reopening mounts a fresh editor.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  let content;
  if (!canEdit) {
    content = <p className="py-8 text-muted-foreground">没有编辑岗位的权限</p>;
  } else if (query.isPending) {
    content = <EditorPageSkeleton />;
  } else if (query.isError) {
    content = (
      <div role="alert" className="space-y-3">
        <p>加载岗位失败</p>
        <Button
          onClick={() => {
            void query.refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  } else if (query.data) {
    content = (
      <JobDescriptionFormDialog
        presentation="page"
        open
        record={query.data}
        departments={departments}
        interviewers={interviewers}
        onDepartmentCreated={() => router.invalidate()}
        onOpenChange={(open) => {
          if (!open) {
            onBack();
          }
        }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
          void router.invalidate();
        }}
      />
    );
  } else {
    content = <p className="py-8 text-muted-foreground">该岗位不存在或已删除</p>;
  }
  return (
    <>
      <EditorPageHeader label="返回岗位" onBack={onBack} />
      {content}
    </>
  );
}
