import type { ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
import { EditorPageHeader } from "../editor-page-header";
import { FormTemplateEditorSkeleton } from "./form-template-editor-skeleton";
import {
  SubjectAgentScope,
  useSubjectAgentHeaderActions,
  useSubjectAgentSubject,
} from "@/components/features/subject-agent/subject-agent-page";
import { CandidateFormTemplateEditorDialog } from "./form-template-editor-dialog";

type ReferenceProps = Pick<
  ComponentProps<typeof CandidateFormTemplateEditorDialog>,
  "jobDescriptions"
>;
export function CandidateFormEditPage({
  templateId,
  onBack,
  jobDescriptions,
}: ReferenceProps & { templateId: string; onBack: () => void }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = useHasPermission("candidateForm", "update");
  const query = useQuery({
    enabled: canEdit,
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.forms[":id"].$get({
          param: { id: templateId, slug },
        }),
        "加载表单题失败",
        { allow404: true },
      ),
    queryKey: ["candidate-form-templates", slug, "edit", templateId],
    // A refetch must not reset a dirty form; reopening mounts a fresh editor.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
  // 表单题只有编辑页（新建走弹窗），使用记录会话（ADR-0045）。
  const agentSubject = useSubjectAgentSubject({
    enabled: canEdit && Boolean(query.data),
    kind: "candidate_form_template",
    recordId: templateId,
  });
  const headerActions = useSubjectAgentHeaderActions(agentSubject);
  let content;
  if (!canEdit) {
    content = <p className="py-8 text-muted-foreground">没有编辑表单题的权限</p>;
  } else if (query.isPending) {
    content = <FormTemplateEditorSkeleton />;
  } else if (query.isError) {
    content = (
      <div role="alert" className="space-y-3">
        <p>加载表单题失败</p>
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
      <CandidateFormTemplateEditorDialog
        presentation="page"
        open
        record={query.data}
        jobDescriptions={jobDescriptions}
        onOpenChange={(open) => {
          if (!open) {
            onBack();
          }
        }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
          void router.invalidate();
        }}
      />
    );
  } else {
    content = <p className="py-8 text-muted-foreground">该表单题不存在或已删除</p>;
  }
  return (
    <>
      <EditorPageHeader actions={headerActions} label="返回表单题" onBack={onBack} />
      <SubjectAgentScope subject={agentSubject}>{content}</SubjectAgentScope>
    </>
  );
}
