"use client";
/* oxlint-disable no-void -- Router navigation returns a promise that this click handler intentionally does not await. */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { offerApprovalLabels } from "@app/shared/offer-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { rpcFetch } from "@/lib/client/api";
import { approvalApi, approvalDetailOptions, approvalKeys } from "./queries";
import { OfferApprovalSnapshotView } from "./snapshot";

const stepLabels = {
  approved: "已通过",
  cancelled: "已取消",
  pending: "待审批",
  rejected: "已驳回",
  waiting: "等待前序审批",
} as const;

export function OfferApprovalDetailPage({
  approvalId,
  slug,
}: {
  approvalId: string;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/w/$slug/studio/offer-approvals/$approvalId" });
  const [comment, setComment] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const detail = useQuery({
    ...approvalDetailOptions(slug, approvalId),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 15_000 : false),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalKeys.detail(slug, approvalId) }),
      queryClient.invalidateQueries({ queryKey: approvalKeys.all(slug) }),
    ]);
  };
  const decision = useMutation({
    mutationFn: (value: "approved" | "rejected") => {
      const step = detail.data?.steps.find((item) => item.status === "pending");
      if (!step) {
        throw new Error("当前没有可处理的审批节点");
      }
      return rpcFetch(
        approvalApi[":approvalId"].steps[":stepId"].decision.$post({
          json: { comment, decision: value, requestId: crypto.randomUUID() },
          param: { approvalId, slug, stepId: step.id },
        }),
        "提交审批结果失败",
      );
    },
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      setComment("");
      await invalidate();
      toast.success("审批结果已保存");
    },
  });
  const withdraw = useMutation({
    mutationFn: () =>
      rpcFetch(
        approvalApi[":approvalId"].withdraw.$post({
          json: { reason: withdrawalReason, requestId: crypto.randomUUID() },
          param: { approvalId, slug },
        }),
        "撤回审批失败",
      ),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      setWithdrawalReason("");
      await invalidate();
      toast.success("审批已撤回");
    },
  });
  const remind = useMutation({
    mutationFn: () =>
      rpcFetch(
        approvalApi[":approvalId"].remind.$post({
          json: { requestId: crypto.randomUUID() },
          param: { approvalId, slug },
        }),
        "催办失败",
      ),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      await invalidate();
      toast.success("已创建通知任务");
    },
  });
  const retryNotification = useMutation({
    mutationFn: (eventId: string) =>
      rpcFetch(
        approvalApi[":approvalId"]["retry-notification"].$post({
          json: { eventId, requestId: crypto.randomUUID() },
          param: { approvalId, slug },
        }),
        "重发通知失败",
      ),
    onError: (error) => toast.error(error.message),
    onSuccess: async () => {
      await invalidate();
      toast.success("已创建新的通知任务");
    },
  });

  if (detail.isPending) {
    return <output>正在加载审批详情…</output>;
  }
  if (detail.error || !detail.data) {
    return <p role="alert">{detail.error?.message ?? "审批单不存在"}</p>;
  }
  const approval = detail.data;
  const current = approval.steps.find((step) => step.status === "pending");
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            onClick={() =>
              void navigate({ params: { slug }, to: "/w/$slug/studio/offer-approvals" })
            }
            size="sm"
            variant="ghost"
          >
            返回审批列表
          </Button>
          <h1 className="mt-2 text-xl font-semibold">Offer 审批</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            第 {approval.attemptNumber} 轮 · {approval.id}
          </p>
        </div>
        <Badge variant="outline">
          {offerApprovalLabels[approval.status]}
          {approval.invalidatedAt ? " · 已不适用" : ""}
        </Badge>
      </div>

      <section className="rounded-lg border p-5">
        <h2 className="font-medium">本次 Offer</h2>
        <div className="mt-4">
          <OfferApprovalSnapshotView snapshot={approval.snapshot} />
        </div>
        <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm">
          <span className="text-muted-foreground">申请理由：</span>
          {approval.reason}
        </p>
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="font-medium">审批流程</h2>
        <ol className="mt-4 space-y-3">
          {approval.steps.map((step) => (
            <li className="rounded-md border p-3" key={step.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {step.position + 1}. {step.approverName}
                </strong>
                <Badge variant="outline">{stepLabels[step.status]}</Badge>
              </div>
              {step.comment ? (
                <p className="mt-2 whitespace-pre-wrap text-sm">{step.comment}</p>
              ) : null}
              {step.decidedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  处理于 {new Date(step.decidedAt).toLocaleString()}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
        {approval.unavailable ? (
          <p className="mt-4 text-sm text-destructive">
            当前审批人不可用，审批不会自动跳过。请撤回后重新发起。
          </p>
        ) : null}
      </section>

      {approval.canDecide && current ? (
        <section className="rounded-lg border p-5">
          <Label htmlFor="approval-comment">审批意见</Label>
          <Textarea
            className="mt-2"
            id="approval-comment"
            maxLength={2000}
            onChange={(event) => setComment(event.target.value)}
            value={comment}
          />
          <p className="mt-2 text-xs text-muted-foreground">通过可不填意见；驳回必须填写原因。</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              disabled={decision.isPending || !comment.trim()}
              onClick={() => decision.mutate("rejected")}
              variant="outline"
            >
              驳回
            </Button>
            <Button disabled={decision.isPending} onClick={() => decision.mutate("approved")}>
              {decision.isPending ? "处理中…" : "通过"}
            </Button>
          </div>
        </section>
      ) : null}

      {approval.canManage && approval.status === "pending" ? (
        <section className="rounded-lg border p-5">
          <Label htmlFor="withdrawal-reason">撤回审批</Label>
          <Textarea
            className="mt-2"
            id="withdrawal-reason"
            maxLength={2000}
            onChange={(event) => setWithdrawalReason(event.target.value)}
            placeholder="请说明撤回原因"
            value={withdrawalReason}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              disabled={remind.isPending || withdraw.isPending}
              onClick={() => remind.mutate()}
              variant="outline"
            >
              催办
            </Button>
            <Button
              disabled={withdraw.isPending || !withdrawalReason.trim()}
              onClick={() => withdraw.mutate()}
              variant="outline"
            >
              撤回审批
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border p-5">
        <h2 className="font-medium">通知记录</h2>
        <div className="mt-3 space-y-2 text-sm">
          {approval.notifications.map((event) => (
            <div className="rounded border p-3" key={event.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  {event.type} · {event.status}
                </p>
                {approval.canManage &&
                ["dead", "failed", "isolated_dead", "isolated_failed"].includes(event.status) ? (
                  <Button
                    disabled={retryNotification.isPending}
                    onClick={() => retryNotification.mutate(event.id)}
                    size="sm"
                    variant="outline"
                  >
                    重发通知
                  </Button>
                ) : null}
              </div>
              {event.error ? <p className="mt-1 text-destructive">{event.error}</p> : null}
              {event.deliveries.map((delivery) => (
                <p className="mt-1 text-xs text-muted-foreground" key={delivery.id}>
                  飞书：{delivery.status}
                  {delivery.error ? ` · ${delivery.error}` : ""}
                </p>
              ))}
            </div>
          ))}
          {approval.notifications.length === 0 ? (
            <p className="text-muted-foreground">暂无通知记录</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="font-medium">历史轮次</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {approval.history.map((item) => (
            <Link
              className={
                item.id === approval.id
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                  : "rounded-md border px-3 py-1.5 text-sm"
              }
              key={item.id}
              params={{ approvalId: item.id, slug }}
              to="/w/$slug/studio/offer-approvals/$approvalId"
            >
              第 {item.attemptNumber} 轮 · {offerApprovalLabels[item.status]}
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
