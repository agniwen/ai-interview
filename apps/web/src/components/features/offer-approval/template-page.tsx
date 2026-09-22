/* oxlint-disable curly, no-void, sort-keys -- The editor keeps ordered approval nodes explicit for administrators. */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionsColumn, customColumn, DataGrid, dateColumn } from "@/components/features/data-grid";
import { PageHeader } from "@/components/features/studio/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys } from "./queries";

const resolverLabels = {
  fixed_member: "固定审批人",
  job_reporting_manager: "岗位汇报上级",
  recruiting_owner: "招聘负责人",
} as const;

export function OfferApprovalTemplatePage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });
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

  const { isPending: settingDefault, mutate: applyDefault } = setDefault;
  type TemplateRecord = NonNullable<typeof templates.data>[number];
  const columns = useMemo(
    () => [
      customColumn<TemplateRecord>({
        key: "name",
        title: "模板名称",
        cell: (template) => (
          <div className="flex items-center gap-2">
            <Link
              className="font-medium text-primary-link hover:underline"
              to="/w/$slug/studio/offer-approval-templates/$templateId"
              params={{ slug, templateId: template.id }}
            >
              {template.name}
            </Link>
            {template.isDefault ? <Badge>默认</Badge> : null}
          </div>
        ),
      }),
      customColumn<TemplateRecord>({
        key: "enabled",
        title: "状态",
        cell: (template) => (
          <Badge variant={template.enabled ? "success" : "outline"}>
            {template.enabled ? "已启用" : "已停用"}
          </Badge>
        ),
      }),
      customColumn<TemplateRecord>({
        key: "nodes",
        title: "审批顺序",
        size: 420,
        cell: (template) => (
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
            {template.nodes.map((node, index) => (
              <li key={node.id} className="inline-flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-muted-foreground">
                    →
                  </span>
                ) : null}
                <span>
                  {index + 1}.{" "}
                  {node.fixedUserId
                    ? (approvers.data?.find((person) => person.userId === node.fixedUserId)?.name ??
                      "成员不可用")
                    : resolverLabels[node.resolverType]}
                </span>
              </li>
            ))}
          </ol>
        ),
      }),
      dateColumn<TemplateRecord>({ key: "updatedAt", title: "更新时间" }),
      actionsColumn<TemplateRecord>({
        inline: [
          {
            label: "编辑",
            onClick: (template) =>
              navigate({
                to: "/w/$slug/studio/offer-approval-templates/$templateId",
                params: { slug, templateId: template.id },
              }),
          },
        ],
        menu: [
          {
            label: "设为默认",
            show: (template) => template.enabled && !template.isDefault,
            disabled: () => settingDefault,
            onClick: (template) => applyDefault(template.id),
          },
          { label: "删除", variant: "destructive", onClick: (template) => setDeleting(template) },
        ],
      }),
    ],
    [approvers.data, settingDefault, applyDefault, slug, navigate],
  );
  const records = templates.data ?? [];
  const totalPages = Math.max(1, Math.ceil(records.length / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);

  return (
    <section className="mx-auto w-full min-w-0 max-w-[96rem] space-y-6">
      <PageHeader
        title="审批流配置"
        description="启用任一模板后，Offer 必须审批通过才能发布。发起时优先加载默认模板，也可切换其他模板；模板修改或删除不会影响已有审批。"
      />
      <DataGrid<TemplateRecord>
        columns={columns}
        data={records.slice((page - 1) * pagination.pageSize, page * pagination.pageSize)}
        total={records.length}
        totalPages={totalPages}
        loading={templates.isPending}
        refetching={templates.isFetching && !templates.isPending}
        error={templates.error}
        getRowId={(template) => template.id}
        onRefresh={() => {
          void templates.refetch();
        }}
        pagination={{
          page,
          pageSize: pagination.pageSize,
          onPageChange: (nextPage) => setPagination((current) => ({ ...current, page: nextPage })),
          onPageSizeChange: (pageSize) => setPagination({ page: 1, pageSize }),
        }}
        toolbarRight={
          <Button
            className="flex-1 sm:flex-none"
            nativeButton={false}
            render={<Link to="/w/$slug/studio/offer-approval-templates/new" params={{ slug }} />}
          >
            <IconPlus />
            新建模板
          </Button>
        }
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyTitle>暂无审批模板</EmptyTitle>
              <EmptyDescription>
                未启用模板时可以直接发布 Offer，也可以手动选择审批人发起审批。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />

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
