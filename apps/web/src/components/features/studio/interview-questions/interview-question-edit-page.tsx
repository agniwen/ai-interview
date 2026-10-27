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
import { InterviewQuestionTemplateEditorDialog } from "./interview-question-template-editor-dialog";

type ReferenceProps = Pick<
  ComponentProps<typeof InterviewQuestionTemplateEditorDialog>,
  "jobDescriptions"
>;
export function InterviewQuestionEditPage({
  templateId,
  onBack,
  jobDescriptions,
}: ReferenceProps & { templateId: string; onBack: () => void }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = useHasPermission("questionTemplate", "update");
  const query = useQuery({
    enabled: canEdit,
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio["interview-questions"][":id"].$get({
          param: { id: templateId, slug },
        }),
        "加载沟通题失败",
        { allow404: true },
      ),
    queryKey: ["interview-question-templates", slug, "edit", templateId],
    // A refetch must not reset a dirty form; reopening mounts a fresh editor.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  let content;
  if (!canEdit) {
    content = <p className="py-8 text-muted-foreground">没有编辑沟通题的权限</p>;
  } else if (query.isPending) {
    content = <EditorPageSkeleton />;
  } else if (query.isError) {
    content = (
      <div role="alert" className="space-y-3">
        <p>加载沟通题失败</p>
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
      <InterviewQuestionTemplateEditorDialog
        presentation="page"
        open
        record={query.data}
        jobDescriptions={jobDescriptions}
        slug={slug}
        onOpenChange={(open) => {
          if (!open) {
            onBack();
          }
        }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
          void router.invalidate();
        }}
      />
    );
  } else {
    content = <p className="py-8 text-muted-foreground">该沟通题不存在或已删除</p>;
  }
  return (
    <>
      <EditorPageHeader label="返回沟通题" onBack={onBack} />
      {content}
    </>
  );
}
