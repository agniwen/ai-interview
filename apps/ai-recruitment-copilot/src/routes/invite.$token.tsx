"use client";

import { createFileRoute, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";

function InviteAcceptRoute() {
  const { token } = useParams({ from: "/invite/$token" });
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (isPending || session?.user) {
      return;
    }
    void router.navigate({
      href: `/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`,
      replace: true,
    });
  }, [isPending, router, session?.user, token]);

  if (isPending || !session?.user) {
    return <div className="p-8 text-muted-foreground">加载中...</div>;
  }

  async function onAccept() {
    setAccepting(true);
    const { data, error } = await authClient.organization.acceptInvitation({
      invitationId: token,
    });
    setAccepting(false);
    if (error || !data) {
      toast.error(error?.message ?? "接受邀请失败");
      return;
    }
    const orgId = data.invitation.organizationId;
    await authClient.organization.setActive({ organizationId: orgId });
    // 新加入的成员在 studio/resumes 看到的是空列表，体验割裂；让他们直接落到 agent，
    // 跟 home shell "开始简历筛选" CTA 共用同一套 ?goto= 分流，
    // 由根路径 route 解析活跃 workspace 后转到 /w/[slug]/agent。
    // New members would land on an empty resume table in studio. Route them to
    // agent, sharing the home-shell "begin screening" CTA's ?goto= dispatcher.
    await router.navigate({ search: { goto: "agent" }, to: "/" });
  }

  async function onReject() {
    const { error } = await authClient.organization.rejectInvitation({
      invitationId: token,
    });
    if (error) {
      toast.error(error.message ?? "拒绝邀请失败");
      return;
    }
    await router.navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">接受工作区邀请</h1>
      <p className="mb-6 text-muted-foreground">
        你被邀请加入一个工作区。点击"接受"完成加入,或拒绝该邀请。
      </p>
      <div className="flex gap-2">
        <Button disabled={accepting} onClick={onAccept}>
          {accepting ? "处理中..." : "接受邀请"}
        </Button>
        <Button disabled={accepting} onClick={onReject} variant="outline">
          拒绝
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/invite/$token")({
  component: InviteAcceptRoute,
});
