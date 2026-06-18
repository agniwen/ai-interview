"use client";

import { Building2Icon, UsersIcon } from "@/components/icons/hugeicons";
import { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { formatDateOnly } from "@arc/shared/utils/time";

const WHITESPACE_REGEX = /\s+/;

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(WHITESPACE_REGEX).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

interface OrgDetail {
  organization: {
    id: string;
    name: string;
    slug: string;
    metadata: string | null;
    createdAt: string;
  };
  members: {
    records: {
      id: string;
      userId: string;
      role: string;
      userName: string;
      userEmail: string;
      userImage: string | null;
      createdAt: string;
    }[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
  };
}

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  hr: "secondary",
  owner: "default",
  viewer: "outline",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  hr: "HR",
  owner: "所有者",
  viewer: "只读",
};

function MemberSkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberList({ data }: { data: OrgDetail }) {
  const { members } = data;

  if (members.records.length === 0) {
    return <div className="py-8 text-center text-muted-foreground text-sm">暂无成员</div>;
  }

  return (
    <>
      {members.records.map((m) => (
        <Card className="gap-0 rounded-lg py-0" key={m.id}>
          <CardContent className="flex items-center gap-3 p-3">
            <Avatar className="size-9">
              <AvatarImage alt={m.userName} src={m.userImage ?? undefined} />
              <AvatarFallback>{getInitials(m.userName, m.userEmail)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{m.userName}</p>
              <p className="truncate text-muted-foreground text-xs">{m.userEmail}</p>
            </div>
            <Badge variant={ROLE_BADGE_VARIANT[m.role] ?? "outline"}>
              {ROLE_LABEL[m.role] ?? m.role}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function MemberContent({ loading, data }: { loading: boolean; data: OrgDetail | null }) {
  if (loading && !data) {
    return <MemberSkeletonList />;
  }
  if (data) {
    return <MemberList data={data} />;
  }
  return null;
}

export function OrgDetailDialog({
  orgId,
  open,
  onOpenChange,
}: {
  orgId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchDetail = useCallback(
    async (p: number) => {
      if (!orgId) {
        return;
      }
      setLoading(true);
      try {
        const result = await rpcFetch<OrgDetail>(
          rpc.api.platform.organizations[":orgId"].$get({
            param: { orgId },
            query: { page: String(p), pageSize: String(pageSize) },
          }),
          "加载工作区详情失败",
        );
        setData(result);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    if (open && orgId) {
      void fetchDetail(1);
    }
    if (!open) {
      setData(null);
      setPage(1);
    }
  }, [open, orgId, fetchDetail]);

  const org = data?.organization;
  const members = data?.members;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2Icon className="size-5" />
            {org?.name ?? "加载中..."}
          </DialogTitle>
          <DialogDescription>
            {org ? <span className="font-mono text-xs">/{org.slug}</span> : "工作区详情"}
          </DialogDescription>
        </DialogHeader>

        {org && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>创建于 {formatDateOnly(org.createdAt)}</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="flex items-center gap-1">
              <UsersIcon className="size-4" />
              {members?.total ?? 0} 成员
            </span>
          </div>
        )}

        <Separator />

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          <MemberContent data={data} loading={loading} />
        </div>

        {members && members.totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-muted-foreground text-xs">
              第 {members.page} / {members.totalPages} 页，共 {members.total} 人
            </span>
            <div className="flex gap-2">
              <Button
                disabled={page <= 1 || loading}
                onClick={() => void fetchDetail(page - 1)}
                size="sm"
                variant="outline"
              >
                上一页
              </Button>
              <Button
                disabled={page >= members.totalPages || loading}
                onClick={() => void fetchDetail(page + 1)}
                size="sm"
                variant="outline"
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
