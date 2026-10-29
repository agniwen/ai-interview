import type { CandidateFormTemplateInput } from "@app/db-schema/candidate-forms";
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
  useAttachSubjectDraftOnCreate,
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
  onCreated,
  jobDescriptions,
}: ReferenceProps & { templateId: string; onBack: () => void; onCreated: (id: string) => void }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNew = templateId === "new";
  const canEdit = useHasPermission("candidateForm", isNew ? "create" : "update");
  const query = useQuery({
    enabled: canEdit && !isNew,
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
  // 已保存的表单题使用记录会话，新建页使用仅本人可见的草稿会话（ADR-0045）。
  const agentSubject = useSubjectAgentSubject({
    enabled: canEdit && (isNew || Boolean(query.data)),
    kind: "candidate_form_template",
    recordId: isNew ? null : templateId,
  });
  const headerActions = useSubjectAgentHeaderActions(agentSubject);
  const handleCreated = useAttachSubjectDraftOnCreate(agentSubject, onCreated);
  let content;
  if (!canEdit) {
    content = <p className="py-8 text-muted-foreground">没有编辑表单题的权限</p>;
  } else if (!isNew && query.isPending) {
    content = <FormTemplateEditorSkeleton />;
  } else if (!isNew && query.isError) {
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
  } else if (isNew || query.data) {
    content = (
      <CandidateFormTemplateEditorDialog
        key={templateId}
        presentation="page"
        onCreated={handleCreated}
        open
        record={isNew ? null : (query.data ?? null)}
        initialDraft={
          isNew
            ? queryClient.getQueryData<CandidateFormTemplateInput | null>([
                "candidate-form-create-draft",
                slug,
              ])
            : undefined
        }
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
