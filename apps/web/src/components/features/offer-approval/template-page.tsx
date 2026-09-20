/* oxlint-disable curly, no-void, sort-keys -- The editor keeps ordered approval nodes explicit for administrators. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import type { OfferApprovalTemplateNode } from "@app/db-schema/offer-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys } from "./queries";

const resolverLabels = {
  fixed_member: "固定审批人",
  job_reporting_manager: "岗位汇报上级",
  recruiting_owner: "招聘负责人",
} as const;

interface TemplateDraft {
  enabled: boolean;
  id: string | null;
  name: string;
  nodes: OfferApprovalTemplateNode[];
}

function newNode(): OfferApprovalTemplateNode {
  return { fixedUserId: null, id: crypto.randomUUID(), resolverType: "fixed_member" };
}

function emptyDraft(): TemplateDraft {
  return { enabled: true, id: null, name: "", nodes: [newNode()] };
}

export function OfferApprovalTemplatePage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const templates = useQuery({
    queryKey: approvalKeys.templates(slug),
    queryFn: () => rpcFetch(approvalApi.templates.$get({ param: { slug } }), "读取审批模板失败"),
  });
  const approvers = useQuery({
    queryKey: approvalKeys.templateApprovers(slug),
    queryFn: () =>
      rpcFetch(approvalApi["template-approvers"].$get({ param: { slug } }), "读取可选审批人失败"),
  });
  const save = useMutation({
    mutationFn: (value: TemplateDraft) => {
      const json = {
        enabled: value.enabled,
        name: value.name,
        nodes: value.nodes,
      };
      return value.id
        ? rpcFetch(
            approvalApi.templates[":templateId"].$put({
              json,
              param: { slug, templateId: value.id },
            }),
            "保存审批模板失败",
          )
        : rpcFetch(approvalApi.templates.$post({ json, param: { slug } }), "新建审批模板失败");
    },
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: approvalKeys.policy(slug) }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.templates(slug) }),
      ]);
      toast.success("审批模板已保存");
    },
  });
  const setDefault = useMutation({
    mutationFn: (templateId: string) =>
      rpcFetch(
        approvalApi.templates[":templateId"].default.$post({
          param: { slug, templateId },
        }),
        "设置默认模板失败",
      ),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: approvalKeys.templates(slug) });
      toast.success("已设为默认审批模板");
    },
  });
  const remove = useMutation({
    mutationFn: (templateId: string) =>
      rpcFetch(
        approvalApi.templates[":templateId"].$delete({ param: { slug, templateId } }),
        "删除审批模板失败",
      ),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      setDeleting(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: approvalKeys.policy(slug) }),
        queryClient.invalidateQueries({ queryKey: approvalKeys.templates(slug) }),
      ]);
      toast.success("审批模板已删除，已发起的审批不受影响");
    },
  });

  function moveNode(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const nodes = [...current.nodes];
      [nodes[index], nodes[index + direction]] = [nodes[index + direction], nodes[index]];
      return { ...current, nodes };
    });
  }

  const draftValid =
    !!draft?.name.trim() &&
    !!draft.nodes.length &&
    draft.nodes.every((node) => node.resolverType !== "fixed_member" || !!node.fixedUserId);
  const approverOptions = (approvers.data ?? []).map((person) => ({
    avatarUrl: person.avatarUrl,
    label: person.name,
    value: person.userId,
  }));

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">审批流配置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            启用任一模板后，Offer
            必须审批通过才能发布；系统会优先加载默认模板，也可以在发起审批时切换其他模板。提交后审批人会固化，模板修改或删除不会影响已有审批。
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())}>
          <IconPlus />
          新建模板
        </Button>
      </header>

      {templates.error ? <p role="alert">{templates.error.message}</p> : null}
      {templates.isPending ? <output>正在读取审批模板…</output> : null}
      <div className="grid gap-3">
        {templates.data?.map((template) => (
          <article className="rounded-lg border p-4" key={template.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{template.name}</h2>
                  {template.isDefault ? <Badge>默认</Badge> : null}
                  <Badge variant={template.enabled ? "success" : "outline"}>
                    {template.enabled ? "已启用" : "已停用"}
                  </Badge>
                </div>
                <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  {template.nodes.map((node, index) => (
                    <li className="rounded-md bg-muted px-2.5 py-1.5" key={node.id}>
                      {index + 1}. {resolverLabels[node.resolverType]}
                      {node.fixedUserId
                        ? ` · ${approvers.data?.find((item) => item.userId === node.fixedUserId)?.name ?? "成员不可用"}`
                        : ""}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex gap-2">
                {template.enabled && !template.isDefault ? (
                  <Button
                    disabled={setDefault.isPending}
                    variant="outline"
                    onClick={() => setDefault.mutate(template.id)}
                  >
                    设为默认
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      enabled: template.enabled,
                      id: template.id,
                      name: template.name,
                      nodes: template.nodes,
                    })
                  }
                >
                  编辑
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(template)}>
                  删除
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {templates.data?.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-muted-foreground">
          暂无审批模板。未启用模板时可以直接发布 Offer，也可以手动选择审批人发起审批。
        </p>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "编辑审批模板" : "新建审批模板"}</DialogTitle>
            <DialogDescription>
              启用模板后，发起人不能修改解析出的审批人。如节点无法解析，请修改模板、岗位汇报关系或招聘负责人。
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="approval-template-name">模板名称</Label>
                <Input
                  id="approval-template-name"
                  maxLength={100}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => current && { ...current, name: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.enabled}
                    id="approval-template-enabled"
                    onCheckedChange={(enabled) =>
                      setDraft((current) => (current ? { ...current, enabled } : current))
                    }
                  />
                  <Label htmlFor="approval-template-enabled">启用模板</Label>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>审批节点（1～5 个）</Label>
                  <Button
                    disabled={draft.nodes.length >= 5}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft((current) =>
                        current ? { ...current, nodes: [...current.nodes, newNode()] } : current,
                      )
                    }
                  >
                    <IconPlus />
                    增加节点
                  </Button>
                </div>
                {draft.nodes.map((node, index) => (
                  <div className="rounded-lg border p-3" key={node.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-7 text-sm font-medium">{index + 1}</span>
                      <NativeSelect
                        className="min-w-44 flex-1"
                        value={node.resolverType}
                        onChange={(event) => {
                          let resolverType: OfferApprovalTemplateNode["resolverType"];
                          switch (event.target.value) {
                            case "fixed_member":
                            case "job_reporting_manager":
                            case "recruiting_owner": {
                              resolverType = event.target.value;
                              break;
                            }
                            default: {
                              return;
                            }
                          }
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  nodes: current.nodes.map((item) =>
                                    item.id === node.id
                                      ? {
                                          ...item,
                                          fixedUserId:
                                            resolverType === "fixed_member"
                                              ? item.fixedUserId
                                              : null,
                                          resolverType,
                                        }
                                      : item,
                                  ),
                                }
                              : current,
                          );
                        }}
                      >
                        {Object.entries(resolverLabels).map(([value, label]) => (
                          <NativeSelectOption key={value} value={value}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {node.resolverType === "fixed_member" ? (
                        <SearchableSelect
                          clearable
                          emptyMessage="没有匹配的审批人"
                          options={approverOptions}
                          placeholder="请选择审批人"
                          searchPlaceholder="搜索审批人…"
                          triggerClassName="min-w-48 flex-1"
                          value={node.fixedUserId}
                          onChange={(value) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    nodes: current.nodes.map((item) =>
                                      item.id === node.id ? { ...item, fixedUserId: value } : item,
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                      ) : null}
                      <Button
                        aria-label={`上移第 ${index + 1} 个节点`}
                        disabled={index === 0}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => moveNode(index, -1)}
                      >
                        <IconArrowUp />
                      </Button>
                      <Button
                        aria-label={`下移第 ${index + 1} 个节点`}
                        disabled={index === draft.nodes.length - 1}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => moveNode(index, 1)}
                      >
                        <IconArrowDown />
                      </Button>
                      <Button
                        aria-label={`删除第 ${index + 1} 个节点`}
                        disabled={draft.nodes.length === 1}
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  nodes: current.nodes.filter((item) => item.id !== node.id),
                                }
                              : current,
                          )
                        }
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={save.isPending}>
              取消
            </Button>
            <Button
              disabled={!draftValid || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending ? "保存中…" : "保存模板"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EntityDeleteDialog
        record={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
        title="删除审批模板？"
        description={(template) =>
          `删除“${template.name}”不会影响已经发起的审批，但以后不能再使用该模板。`
        }
      />
    </section>
  );
}
