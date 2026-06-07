"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { authClient } from "@/lib/client/auth-client";

interface JoinClientProps {
  code: string;
  workspace: { id: string; name: string; slug: string; logo: string | null };
}

export function JoinClient({ code, workspace }: JoinClientProps) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);

  async function onAccept() {
    setAccepting(true);
    try {
      const result = await rpcFetch<{
        organizationId: string;
        organizationSlug: string;
        status: "joined" | "already_member";
      }>(rpc.api.join[":code"].accept.$post({ param: { code } }), "加入工作区失败");
      await authClient.organization.setActive({ organizationId: result.organizationId });
      router.push("/?goto=chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入工作区失败");
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">加入工作区</h1>
      <p className="mb-6 text-muted-foreground">
        你被邀请加入工作区「{workspace.name}」。加入后默认为 HR 角色,可由管理员调整。
      </p>
      <div className="flex gap-2">
        <Button disabled={accepting} onClick={onAccept}>
          {accepting ? "处理中..." : "加入工作区"}
        </Button>
        <Button disabled={accepting} onClick={() => router.push("/")} variant="outline">
          取消
        </Button>
      </div>
    </div>
  );
}
