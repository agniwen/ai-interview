"use client";

import { IconBriefcase, IconCalendar, IconCheck, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type { PublicOfferRecord } from "@app/shared/studio-pipeline-stages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeZone: "Asia/Shanghai" }).format(
        new Date(value),
      )
    : "—";
}

function money(value: number | null, currency: string): string {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat("zh-CN", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function PublicOfferPage({
  initialOffer,
  token,
}: {
  initialOffer: PublicOfferRecord;
  token: string;
}) {
  const [offer, setOffer] = useState(initialOffer);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [pending, setPending] = useState(false);

  async function respond(response: "accepted" | "declined") {
    setPending(true);
    try {
      const result = await fetch(`/api/public/offers/${encodeURIComponent(token)}/respond`, {
        body: JSON.stringify({
          declineReason: response === "declined" ? declineReason.trim() || null : null,
          response,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const parsed = z
        .object({ error: z.string().optional(), status: z.string().optional() })
        .safeParse(await result.json());
      if (!result.ok || !parsed.success || !parsed.data.status) {
        throw new Error(
          parsed.success ? (parsed.data.error ?? "提交失败，请稍后重试") : "提交失败，请稍后重试",
        );
      }
      const nextStatus = parsed.data.status === "accepted" ? "accepted" : "declined";
      setOffer((current) => ({
        ...current,
        declineReason: declineReason.trim() || null,
        responseAt: new Date().toISOString(),
        status: nextStatus,
      }));
      toast.success(response === "accepted" ? "您已接受 Offer" : "您已拒绝 Offer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  const finished = offer.status === "accepted" || offer.status === "declined";
  const expired = offer.status === "expired";
  const superseded = offer.status === "superseded";
  let statusLabel = "待确认";
  let statusVariant: "info" | "outline" | "success" = "info";
  if (offer.status === "accepted") {
    statusLabel = "已接受";
    statusVariant = "success";
  } else if (offer.status === "declined") {
    statusLabel = "已拒绝";
    statusVariant = "outline";
  } else if (superseded) {
    statusLabel = "已失效";
    statusVariant = "outline";
  } else if (expired) {
    statusLabel = "已过期";
    statusVariant = "outline";
  }

  let responsePanel = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button disabled={pending} onClick={() => setDeclining(true)} variant="outline">
        <IconX className="size-4" />
        拒绝 Offer
      </Button>
      <Button disabled={pending} onClick={async () => await respond("accepted")}>
        <IconCheck className="size-4" />
        {pending ? "提交中…" : "接受 Offer"}
      </Button>
    </div>
  );
  if (finished) {
    responsePanel = (
      <div className="rounded-xl border bg-muted/30 p-5 text-center">
        <p className="font-medium">
          {offer.status === "accepted" ? "您已接受本次 Offer" : "您已拒绝本次 Offer"}
        </p>
        <p className="mt-1 text-muted-foreground text-sm">招聘负责人已收到通知。</p>
      </div>
    );
  } else if (superseded) {
    responsePanel = (
      <p className="text-center text-muted-foreground text-sm">
        当前 Offer 已失效，请联系招聘负责人获取新的 Offer。
      </p>
    );
  } else if (expired) {
    responsePanel = (
      <p className="rounded-xl border p-4 text-center text-muted-foreground text-sm">
        当前 Offer 已过期，请联系招聘负责人。
      </p>
    );
  } else if (declining) {
    responsePanel = (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="font-medium text-sm">拒绝 Offer</p>
        <Textarea
          maxLength={1000}
          onChange={(event) => setDeclineReason(event.target.value)}
          placeholder="可以填写拒绝原因（选填）"
          rows={3}
          value={declineReason}
        />
        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={() => setDeclining(false)} variant="outline">
            返回
          </Button>
          <Button
            disabled={pending}
            onClick={async () => await respond("declined")}
            variant="destructive"
          >
            <IconX className="size-4" />
            {pending ? "提交中…" : "确认拒绝"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-background shadow-sm">
        <header className="border-b bg-card px-6 py-7 sm:px-10">
          <p className="font-semibold text-foreground text-lg">{offer.companyName}</p>
          <h1 className="mt-2 font-semibold text-2xl tracking-tight">
            致 {offer.candidateName} 的 Offer
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            请核对以下信息，并在有效期内确认您的选择。
          </p>
        </header>
        <section className="space-y-7 px-6 py-7 sm:px-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-xs">职位</p>
              <p className="mt-1 flex items-center gap-2 font-medium text-lg">
                <IconBriefcase className="size-5" />
                {offer.position}
              </p>
            </div>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <dl className="grid gap-5 rounded-xl border bg-muted/20 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Base 月薪</dt>
              <dd className="mt-1 font-medium">{money(offer.baseSalary, offer.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">年度奖金</dt>
              <dd className="mt-1 font-medium">{money(offer.bonus, offer.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">期权 / 股票</dt>
              <dd className="mt-1 font-medium">{offer.equity || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">预计入职日</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium">
                <IconCalendar className="size-4" />
                {formatDate(offer.joiningDate)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Offer 有效期至（北京时间，含当天）</dt>
              <dd className="mt-1 font-medium">{formatDate(offer.expiresAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">发布于</dt>
              <dd className="mt-1 font-medium">{formatDate(offer.publishedAt)}</dd>
            </div>
          </dl>
          {responsePanel}
        </section>
      </div>
    </main>
  );
}
