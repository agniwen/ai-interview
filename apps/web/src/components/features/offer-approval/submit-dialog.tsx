/* oxlint-disable complexity, curly, no-void, sort-keys -- The submission surface keeps template and legacy manual states visible together. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys } from "./queries";
import { OfferApprovalSnapshotView } from "./snapshot";

interface ApproverOption {
  feishuBound: boolean;
  name: string;
  userId: string;
}

function ApproverEditor({
  approverIds,
  approvers,
  disabled,
  onChange,
}: {
  approverIds: string[];
  approvers: ApproverOption[] | undefined;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  function move(index: number, direction: number) {
    const next = [...approverIds];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }
  return (
    <div className="space-y-3">
      <NativeSelect
        value=""
        disabled={approverIds.length >= 5 || disabled}
        onChange={(event) => {
          if (event.target.value) onChange([...approverIds, event.target.value]);
        }}
      >
        <NativeSelectOption value="">请选择审批人</NativeSelectOption>
        {approvers
          ?.filter((person) => !approverIds.includes(person.userId))
          .map((person) => (
            <NativeSelectOption key={person.userId} value={person.userId}>
              {person.name}
              {person.feishuBound ? "" : "（未绑定飞书）"}
            </NativeSelectOption>
          ))}
      </NativeSelect>
      <ol className="space-y-2">
        {approverIds.map((id, index) => (
          <li className="flex flex-wrap items-center gap-2" key={id}>
            <span className="flex-1">
              {index + 1}. {approvers?.find((person) => person.userId === id)?.name ?? "成员不可用"}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!index || disabled}
              onClick={() => move(index, -1)}
            >
              上移
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={index === approverIds.length - 1 || disabled}
              onClick={() => move(index, 1)}
            >
              下移
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(approverIds.filter((item) => item !== id))}
            >
              移除
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function chooseApprovalTemplate<Template extends { id: string; isDefault: boolean }>(
  templates: Template[],
  selectedTemplateId: string | null,
) {
  return (
    templates.find((template) => template.id === selectedTemplateId) ??
    templates.find((template) => template.isDefault) ??
    templates[0]
  );
}

export function SubmitOfferApprovalDialog({
  slug,
  offerId,
  recordId,
  onClose,
  onSaved,
}: {
  slug: string;
  offerId: string;
  recordId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [manualApproverIds, setManualApproverIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryFn: () =>
      rpcFetch(
        approvalApi.preview[":offerId"].$get({ param: { slug, offerId } }),
        "读取审批内容失败",
      ),
    queryKey: approvalKeys.preview(slug, offerId),
    staleTime: 0,
  });
  const approvers = useQuery({
    queryFn: () => rpcFetch(approvalApi.approvers.$get({ param: { slug } }), "读取审批人失败"),
    queryKey: [...approvalKeys.all(slug), "approvers"],
  });
  const templates = preview.data?.templates ?? [];
  const activeTemplate = chooseApprovalTemplate(templates, selectedTemplateId);
  const templateApproverIds = activeTemplate?.nodes.map((node) => node.approverId) ?? [];
  const approverIds = activeTemplate ? templateApproverIds : manualApproverIds;
  const mutation = useMutation({
    mutationFn: () => {
      if (!preview.data) throw new Error("请先读取 Offer 内容");
      return rpcFetch(
        approvalApi.$post({
          param: { slug },
          json: {
            approverIds,
            expectedContentRevision: preview.data.contentRevision,
            expectedSnapshotHash: preview.data.snapshotHash,
            offerId,
            reason,
            recruitingRecordId: recordId,
            requestId,
            templateId: activeTemplate?.id ?? null,
          },
        }),
        "审批提交失败",
      );
    },
    onError: (error) => toast.error(error.message),
    onSuccess: async (result) => {
      setSubmittedId(result.approvalId);
      await queryClient.invalidateQueries({ queryKey: approvalKeys.all(slug) });
      onSaved();
      toast.success("审批已提交，通知发送中");
    },
  });
  const cannotSubmit =
    !preview.data ||
    !reason.trim() ||
    !approverIds.length ||
    !!activeTemplate?.error ||
    mutation.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>提交 Offer 审批</DialogTitle>
          <DialogDescription>
            发起审批后，当前 Offer 须审批通过才能发布；提交时确认的审批人不会随模板变化。
          </DialogDescription>
        </DialogHeader>
        {submittedId ? (
          <>
            <p>审批已保存。通知失败不影响系统待办。</p>
            <Link
              to="/w/$slug/studio/offer-approvals/$approvalId"
              params={{ approvalId: submittedId, slug }}
            >
              查看审批进度
            </Link>
          </>
        ) : (
          <>
            {preview.data ? (
              <OfferApprovalSnapshotView snapshot={preview.data.snapshot} />
            ) : (
              <output>{preview.error?.message ?? "正在读取当前 Offer…"}</output>
            )}
            <Label htmlFor="approval-reason">申请理由</Label>
            <Textarea
              id="approval-reason"
              value={reason}
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
              disabled={mutation.isPending}
            />

            {activeTemplate ? (
              <section className="space-y-3 rounded-lg border p-4">
                <div className="space-y-2">
                  <Label htmlFor="approval-template">审批模板</Label>
                  <NativeSelect
                    id="approval-template"
                    value={activeTemplate.id}
                    disabled={mutation.isPending}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                  >
                    {templates.map((template) => (
                      <NativeSelectOption key={template.id} value={template.id}>
                        {template.name}
                        {template.isDefault ? "（默认）" : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                {activeTemplate.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    模板无法使用：{activeTemplate.error}
                    。请更换模板或联系审批管理员修改模板、岗位汇报关系或招聘负责人。
                  </p>
                ) : null}
                <ol className="space-y-2">
                  {activeTemplate.nodes.map((node, index) => (
                    <li className="flex flex-wrap items-center gap-2" key={node.nodeId}>
                      <span className="w-5 text-sm">{index + 1}.</span>
                      <span className="font-medium">{node.approverName}</span>
                      <Badge variant="outline">{node.sourceLabel}</Badge>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  模板审批人按当前配置解析并锁定。重复人员会保留为独立节点，提交人本人也可作为模板节点审批。
                </p>
              </section>
            ) : (
              <section className="space-y-2">
                <Label>按顺序选择审批人（1～5 人）</Label>
                <ApproverEditor
                  approverIds={manualApproverIds}
                  approvers={approvers.data}
                  disabled={mutation.isPending}
                  onChange={setManualApproverIds}
                />
                <p className="text-xs text-muted-foreground">
                  当前工作区没有启用审批模板，本次使用手动选择。
                </p>
              </section>
            )}
            {approvers.error ? <p role="alert">{approvers.error.message}</p> : null}
            {approvers.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无可选审批人，请管理员为成员授予审批页面、读取与处理权限。
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              未绑定飞书的成员仍有系统待办；请提醒其从审批入口处理。
            </p>
            {mutation.error ? (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}。若人员或模板已变化，请刷新后重新确认。
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
                取消
              </Button>
              <Button disabled={cannotSubmit} onClick={() => mutation.mutate()}>
                {mutation.isPending ? "提交中…" : "确认提交"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
