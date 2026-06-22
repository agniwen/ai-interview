"use client";

import { useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
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
      await navigate({ search: { goto: "chat" }, to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入工作区失败");
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">加入工作区</h1>
      <p className="mb-6 text-muted-foreground">
        你被邀请加入工作区「{workspace.name}」。加入后默认为普通成员，并进入默认招聘组。
      </p>
      <div className="flex gap-2">
        <Button disabled={accepting} onClick={onAccept}>
          {accepting ? "处理中..." : "加入工作区"}
        </Button>
        <Button disabled={accepting} onClick={() => void navigate({ to: "/" })} variant="outline">
          取消
        </Button>
      </div>
    </div>
  );
}
