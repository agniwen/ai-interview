"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [accepting, setAccepting] = useState(false);

  if (isPending) {
    return <div className="p-8 text-muted-foreground">加载中...</div>;
  }

  if (!session?.user) {
    router.replace(`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`);
    return null;
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
    // 新加入的成员在 studio/resumes 看到的是空列表，体验割裂；让他们直接落到 chat，
    // 跟 home shell "开始简历筛选" CTA 共用同一套 ?goto= 分流，
    // 由根路径 page.tsx 解析活跃 workspace 后转到 /w/[slug]/chat。
    // New members would land on an empty resume table in studio — jarring. Route
    // them straight to chat, sharing the home-shell "begin screening" CTA's
    // ?goto= dispatcher; root page.tsx resolves the active workspace.
    router.push("/?goto=chat");
  }

  async function onReject() {
    const { error } = await authClient.organization.rejectInvitation({
      invitationId: token,
    });
    if (error) {
      toast.error(error.message ?? "拒绝邀请失败");
      return;
    }
    router.push("/");
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
