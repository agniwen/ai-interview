/* oxlint-disable curly, sort-keys -- Request field ordering follows the approval command contract presented to recruiters. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalKeys } from "./queries";
import { OfferApprovalSnapshotView } from "./snapshot";

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
  const [approverIds, setApproverIds] = useState<string[]>([]);
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
  const mutation = useMutation({
    mutationFn: () => {
      if (!preview.data) throw new Error("请先读取 Offer 内容");
      return rpcFetch(
        approvalApi.$post({
          param: { slug },
          json: {
            offerId,
            recruitingRecordId: recordId,
            expectedContentRevision: preview.data.contentRevision,
            expectedSnapshotHash: preview.data.snapshotHash,
            approverIds,
            reason,
            requestId,
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
  function move(index: number, direction: number) {
    setApproverIds((ids) => {
      const next = [...ids];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>提交 Offer 审批</DialogTitle>
          <DialogDescription>
            发起审批后，本次招聘后续 Offer 须审批通过才能发布；撤回或重建 Offer 不会恢复免审发布。
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
              onChange={(e) => setReason(e.target.value)}
              disabled={mutation.isPending}
            />
            <Label htmlFor="approval-person">按顺序选择审批人（1～5 人）</Label>
            <NativeSelect
              id="approval-person"
              value=""
              disabled={approverIds.length >= 5 || mutation.isPending}
              onChange={(e) => {
                if (e.target.value) {
                  setApproverIds((ids) => [...ids, e.target.value]);
                }
              }}
            >
              <NativeSelectOption value="">请选择审批人</NativeSelectOption>
              {approvers.data
                ?.filter((person) => !approverIds.includes(person.userId))
                .map((person) => (
                  <NativeSelectOption key={person.userId} value={person.userId}>
                    {person.name}
                    {person.feishuBound ? "" : "（未绑定飞书）"}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            {approvers.error ? <p role="alert">{approvers.error.message}</p> : null}
            {approvers.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无可选审批人，请管理员为成员授予审批页面、读取与处理权限。申请人不能审批自己的单据。
              </p>
            ) : null}
            <ol className="space-y-2">
              {approverIds.map((id, index) => (
                <li key={id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    {index + 1}. {approvers.data?.find((person) => person.userId === id)?.name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!index || mutation.isPending}
                    onClick={() => move(index, -1)}
                  >
                    上移
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === approverIds.length - 1 || mutation.isPending}
                    onClick={() => move(index, 1)}
                  >
                    下移
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => setApproverIds((ids) => ids.filter((item) => item !== id))}
                  >
                    移除
                  </Button>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              未绑定飞书的成员仍有系统待办；请提醒其从审批入口处理。
            </p>
            {mutation.error ? (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
                。若请求超时，请保持内容不变重试，系统会返回原申请；也可到“我发起的”核对。
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
                取消
              </Button>
              <Button
                disabled={
                  !preview.data || !reason.trim() || !approverIds.length || mutation.isPending
                }
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "提交中…" : "确认提交"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
