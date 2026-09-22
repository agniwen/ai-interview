import { lazy, Suspense, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { OfferApprovalTemplateNode } from "@app/db-schema/offer-approval";
import { offerApprovalTemplateInputSchema } from "@app/shared/offer-approval";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/features/studio/page-header";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys } from "./queries";

const TemplateFlowEditor = lazy(() => import("./template-flow-editor"));
interface TemplateDraft {
  enabled: boolean;
  name: string;
  nodes: OfferApprovalTemplateNode[];
}
const listPath = "/w/$slug/studio/offer-approval-templates";

function TemplateEditorForm({
  slug,
  templateId,
  initial,
}: {
  slug: string;
  templateId: string | null;
  initial?: TemplateDraft;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [baseline] = useState<TemplateDraft>(() =>
    initial
      ? { enabled: initial.enabled, name: initial.name, nodes: initial.nodes }
      : {
          enabled: true,
          name: "",
          nodes: [{ fixedUserId: null, id: crypto.randomUUID(), resolverType: "fixed_member" }],
        },
  );
  const [draft, setDraft] = useState(baseline);
  const savedRef = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const approvers = useQuery({
    queryFn: () =>
      rpcFetch(approvalApi["template-approvers"].$get({ param: { slug } }), "读取可选审批人失败"),
    queryKey: approvalKeys.templateApprovers(slug),
  });
  const save = useMutation({
    mutationFn: (value: TemplateDraft) =>
      templateId
        ? rpcFetch(
            approvalApi.templates[":templateId"].$put({ json: value, param: { slug, templateId } }),
            "保存审批模板失败",
          )
        : rpcFetch(
            approvalApi.templates.$post({ json: value, param: { slug } }),
            "新建审批模板失败",
          ),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      savedRef.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: approvalKeys.policy(slug) }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.templates(slug) }),
      ]);
      toast.success("审批模板已保存");
      await navigate({ params: { slug }, to: listPath });
    },
  });
  const blocker = useBlocker({
    enableBeforeUnload: () => !savedRef.current && (dirty || save.isPending),
    shouldBlockFn: () => !savedRef.current && (dirty || save.isPending),
    withResolver: true,
  });
  const valid = offerApprovalTemplateInputSchema.safeParse(draft).success;
  const options = (approvers.data ?? []).map((person) => ({
    avatarUrl: person.avatarUrl,
    label: person.name,
    value: person.userId,
  }));
  return (
    <>
      <section className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <output className="flex h-full items-center justify-center text-sm text-muted-foreground">
              正在加载流程画布…
            </output>
          }
        >
          <TemplateFlowEditor
            nodes={draft.nodes}
            approvers={options}
            disabled={save.isPending}
            onChange={(nodes) => setDraft((current) => ({ ...current, nodes }))}
            toolbar={
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-sm font-semibold">
                  {templateId ? "编辑审批模板" : "新建审批模板"}
                </h1>
                <Button
                  size="sm"
                  disabled={!valid || save.isPending}
                  onClick={() => save.mutate(draft)}
                >
                  {save.isPending ? "保存中…" : "保存模板"}
                </Button>
              </div>
            }
            settings={
              <fieldset disabled={save.isPending} className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="approval-template-name">模板名称</Label>
                  <Input
                    id="approval-template-name"
                    maxLength={100}
                    value={draft.name}
                    placeholder="例如：标准 Offer 审批"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="approval-template-enabled">启用模板</Label>
                  <Switch
                    id="approval-template-enabled"
                    checked={draft.enabled}
                    onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  启用后 Offer 必须审批通过才能发布，修改模板不会影响已有审批。
                </p>
                {approvers.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {approvers.error.message}
                  </p>
                ) : null}
                {save.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {save.error.message}
                  </p>
                ) : null}
              </fieldset>
            }
          />
        </Suspense>
      </section>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            blocker.reset?.();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              审批模板尚未保存，离开后本次修改将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              继续编辑
            </Button>
            <Button
              variant="destructive"
              disabled={save.isPending}
              onClick={() => blocker.proceed?.()}
            >
              放弃修改并离开
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function OfferApprovalTemplateEditorPage({
  slug,
  templateId,
}: {
  slug: string;
  templateId: string | null;
}) {
  const templates = useQuery({
    enabled: templateId !== null,
    queryFn: () => rpcFetch(approvalApi.templates.$get({ param: { slug } }), "读取审批模板失败"),
    queryKey: approvalKeys.templates(slug),
  });
  if (templateId && !templates.data) {
    return (
      <section className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="编辑审批模板" />
        {templates.error ? (
          <div role="alert">
            <p>{templates.error.message}</p>
            <Button
              variant="outline"
              onClick={() => {
                void templates.refetch();
              }}
            >
              重试
            </Button>
          </div>
        ) : (
          <output>正在读取审批模板…</output>
        )}
      </section>
    );
  }
  const template = templates.data?.find((item) => item.id === templateId);
  if (templateId && !template) {
    return (
      <section className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="审批模板不存在" />
        <p className="text-sm text-muted-foreground">该模板可能已被删除，请返回列表查看。</p>
        <Button nativeButton={false} render={<Link to={listPath} params={{ slug }} />}>
          返回审批流配置
        </Button>
      </section>
    );
  }
  return (
    <TemplateEditorForm
      key={`${slug}:${templateId ?? "new"}`}
      slug={slug}
      templateId={templateId}
      initial={template}
    />
  );
}
