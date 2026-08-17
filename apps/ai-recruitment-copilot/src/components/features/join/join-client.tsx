"use client";

import { useNavigate } from "@tanstack/react-router";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

interface JoinClientProps {
  code: string;
  initialRole: string;
  workspace: { id: string; name: string; slug: string; logo: string | null };
}

export function JoinClient({ code, initialRole, workspace }: JoinClientProps) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const isNoAccessInvite = initialRole === NO_ACCESS_WORKSPACE_ROLE;

  async function onAccept() {
    setAccepting(true);
    try {
      const result = await rpcFetch<{
        organizationId: string;
        organizationSlug: string;
        status: "joined" | "already_member";
      }>(rpc.api.join[":code"].accept.$post({ param: { code } }), "加入工作区失败");
      await navigate({ href: `/w/${result.organizationSlug}/agent` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入工作区失败");
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">加入工作区</h1>
      <p className="mb-6 text-muted-foreground">
        你被邀请加入工作区「{workspace.name}」。
        {isNoAccessInvite
          ? "加入后需要等待管理员分配其他角色。"
          : "加入后将按邀请链接设置初始化工作区角色。"}
      </p>
      <div className="flex gap-2">
        <Button disabled={accepting} onClick={onAccept}>
          {accepting ? "处理中..." : "加入工作区"}
        </Button>
        <Button
          disabled={accepting}
          onClick={() => {
            navigate({ to: "/" });
          }}
          variant="outline"
        >
          取消
        </Button>
      </div>
    </div>
  );
}
