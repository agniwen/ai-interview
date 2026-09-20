"use client";
/* oxlint-disable no-void -- Router navigation returns a promise that this click handler intentionally does not await. */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { offerApprovalLabels } from "@app/shared/offer-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

function notificationTypeLabel(type: string) {
  if (type === "offer_approval_pending") {
    return "待审批通知";
  }
  if (type === "offer_approval_result") {
    return "审批结果通知";
  }
  if (type === "offer_approval_cancelled") {
    return "审批结束通知";
  }
  return "审批通知";
}

function notificationStatusLabel(status: string) {
  if (["completed", "isolated_completed"].includes(status)) {
    return "已发送";
  }
  if (["processing", "isolated_processing"].includes(status)) {
    return "发送中";
  }
  if (["pending", "isolated_pending"].includes(status)) {
    return "等待发送";
  }
  if (["failed", "isolated_failed"].includes(status)) {
    return "发送失败，可重试";
  }
  if (["dead", "isolated_dead"].includes(status)) {
    return "发送失败";
  }
  if (status === "cancelled") {
    return "已取消";
  }
  return "状态未知";
}

// oxlint-disable-next-line complexity -- This page composes permission-gated approval, reminder, history, and notification states.
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
  const canDecide = approval.canDecide && Boolean(current);
  const canRemind = approval.canManage && approval.status === "pending" && !approval.canDecide;
  const previousApprovals = approval.history.filter((item) => item.id !== approval.id);
  const showApprovalRecords =
    approval.canManage && (approval.notifications.length > 0 || previousApprovals.length > 0);
  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
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
          <h1 className="mt-2 text-xl font-semibold">
            {approval.snapshot.candidateName}的 Offer 审批
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            第 {approval.attemptNumber} 轮 · {approval.snapshot.position}
          </p>
        </div>
        <Badge variant="outline">
          {offerApprovalLabels[approval.status]}
          {approval.invalidatedAt ? " · 已不适用" : ""}
        </Badge>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-medium">本次 Offer</h2>
        <div className="mt-5">
          <OfferApprovalSnapshotView
            className="lg:grid-cols-4 [&>div:last-child]:lg:col-span-4"
            snapshot={approval.snapshot}
          />
        </div>
        <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm">
          <span className="text-muted-foreground">申请理由：</span>
          {approval.reason}
        </p>
        {approval.templateName ? (
          <p className="mt-2 text-xs text-muted-foreground">
            发起模板：{approval.templateName}（仅作为本次节点来源快照）
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-medium">审批流程</h2>
        <ol className="mt-4 divide-y border-y">
          {approval.steps.map((step) => (
            <li className="py-4" key={step.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>
                    {step.position + 1}. {step.approverName}
                  </strong>
                  <Badge variant="outline">{step.sourceLabel}</Badge>
                  {approval.unavailableStepIds.includes(step.id) ? (
                    <Badge variant="destructive">审批人异常</Badge>
                  ) : null}
                </div>
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
            审批流程中存在已离开工作区或权限失效的审批人，系统不会自动跳过。恢复权限后可继续；无法恢复时请回到候选人的
            Offer 内容撤回后重新发起。
          </p>
        ) : null}

        {canDecide && current ? (
          <div className="mt-5 border-t pt-5">
            <Label className="font-medium" htmlFor="approval-comment">
              审批意见
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">通过可不填；驳回时请说明原因。</p>
            <Textarea
              className="mt-3"
              id="approval-comment"
              maxLength={2000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="请输入审批意见"
              value={comment}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                当前处理：第 {current.position + 1} 节点
              </p>
              <div className="flex gap-2">
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
            </div>
          </div>
        ) : null}

        {canRemind ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className="text-sm text-muted-foreground">
              当前等待 {current?.approverName ?? "审批人"} 处理。
            </p>
            <Button disabled={remind.isPending} onClick={() => remind.mutate()} variant="outline">
              {remind.isPending ? "催办中…" : "催办当前审批人"}
            </Button>
          </div>
        ) : null}
      </section>

      {showApprovalRecords ? (
        <section className="border-t">
          <Accordion multiple>
            <AccordionItem value="approval-records">
              <AccordionTrigger className="hover:no-underline">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>审批记录</span>
                  <span className="font-normal text-muted-foreground text-xs">
                    {previousApprovals.length > 0 ? `${previousApprovals.length} 轮历史 · ` : ""}
                    {approval.notifications.length} 条通知
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-5">
                {previousApprovals.length > 0 ? (
                  <div>
                    <h2 className="text-sm font-medium">历史审批</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Offer 撤回、驳回或修改后重新提交时，会保留之前的审批结果。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {previousApprovals.map((item) => (
                        <Link
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                          key={item.id}
                          params={{ approvalId: item.id, slug }}
                          to="/w/$slug/studio/offer-approvals/$approvalId"
                        >
                          第 {item.attemptNumber} 轮 · {offerApprovalLabels[item.status]}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}

                {approval.notifications.length > 0 ? (
                  <div>
                    <h2 className="text-sm font-medium">通知状态</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      记录待审批、审批结果等消息是否已发送给相关人员。
                    </p>
                    <div className="mt-3 divide-y border-y">
                      {approval.notifications.map((event) => (
                        <div
                          className="flex flex-wrap items-center gap-3 p-3 text-sm"
                          key={event.id}
                        >
                          <span>{notificationTypeLabel(event.type)}</span>
                          <Badge variant="outline">{notificationStatusLabel(event.status)}</Badge>
                          <time className="text-muted-foreground text-xs">
                            {new Date(event.createdAt).toLocaleString()}
                          </time>
                          {["dead", "failed", "isolated_dead", "isolated_failed"].includes(
                            event.status,
                          ) ? (
                            <Button
                              className="ml-auto"
                              disabled={retryNotification.isPending}
                              onClick={() => retryNotification.mutate(event.id)}
                              size="sm"
                              variant="outline"
                            >
                              重发通知
                            </Button>
                          ) : null}
                          {event.error ? (
                            <p className="w-full text-destructive text-xs">{event.error}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      ) : null}
    </section>
  );
}
