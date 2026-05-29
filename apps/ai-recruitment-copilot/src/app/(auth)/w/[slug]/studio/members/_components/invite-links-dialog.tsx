"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BanIcon, CopyIcon, LinkIcon, PlayIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TimeDisplay } from "@/components/time-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface InviteLinkDto {
  id: string;
  code: string;
  createdAt: string;
  createdBy: string | null;
  creatorName: string | null;
  disabledAt: string | null;
  joinedCount: number;
}

interface LinkMemberDto {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
}

const QUERY_KEY = (slug: string) => ["invite-links", slug] as const;

function LinkMembers({ id, slug }: { id: string; slug: string }) {
  const { data, isPending } = useQuery({
    queryFn: () =>
      rpcFetch<{ members: LinkMemberDto[] }>(
        rpc.api.w[":slug"].studio.workspace["invite-links"][":id"].members.$get({
          param: { id, slug },
        }),
        "加载成员失败",
      ),
    queryKey: ["invite-link-members", slug, id],
  });

  if (isPending) {
    return <div className="mt-3 text-xs text-muted-foreground">加载中...</div>;
  }
  const members = data?.members ?? [];
  if (members.length === 0) {
    return <div className="mt-3 text-xs text-muted-foreground">尚无成员通过此链接加入</div>;
  }
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {members.map((m) => (
        <li className="flex justify-between" key={m.userId}>
          <span>
            {m.name} <span className="text-muted-foreground">({m.email})</span>
          </span>
          <TimeDisplay value={m.joinedAt} />
        </li>
      ))}
    </ul>
  );
}

interface LinkRowProps {
  link: InviteLinkDto;
  expanded: boolean;
  slug: string;
  onCopy: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onToggleExpand: () => void;
}

function LinkRow({
  link,
  expanded,
  slug,
  onCopy,
  onDisable,
  onEnable,
  onToggleExpand,
}: LinkRowProps) {
  const url =
    typeof window === "undefined"
      ? `/join/${link.code}`
      : `${window.location.origin}/join/${link.code}`;
  const disabled = Boolean(link.disabledAt);
  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm">{url}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {link.creatorName ?? "已删除用户"} · <TimeDisplay value={link.createdAt} />
              {disabled ? " · 已禁用" : ""}
            </div>
          </div>
          <Button aria-label="复制链接" onClick={onCopy} size="sm" variant="ghost">
            <CopyIcon />
          </Button>
          <Button aria-label="查看加入成员" onClick={onToggleExpand} size="sm" variant="ghost">
            <UsersIcon /> {link.joinedCount}
          </Button>
          {disabled ? (
            <Button aria-label="启用链接" onClick={onEnable} size="sm" variant="ghost">
              <PlayIcon />
            </Button>
          ) : (
            <Button aria-label="禁用链接" onClick={onDisable} size="sm" variant="ghost">
              <BanIcon />
            </Button>
          )}
        </div>
        {expanded ? <LinkMembers id={link.id} slug={slug} /> : null}
      </CardContent>
    </Card>
  );
}

async function copyInviteUrl(code: string) {
  const url = `${window.location.origin}/join/${code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("已复制链接");
  } catch {
    toast.error("复制失败，请手动复制");
  }
}

export function InviteLinksDialog() {
  const [open, setOpen] = useState(false);
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: linksData, isPending } = useQuery({
    enabled: open,
    queryFn: () =>
      rpcFetch<{ links: InviteLinkDto[] }>(
        rpc.api.w[":slug"].studio.workspace["invite-links"].$get({ param: { slug } }),
        "加载邀请链接失败",
      ),
    queryKey: QUERY_KEY(slug),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"].$post({ param: { slug } }),
        "生成邀请链接失败",
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "生成失败"),
    onSuccess: async (link) => {
      const url = `${window.location.origin}/join/${link.code}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`邀请链接已生成并复制：${url}`);
      } catch {
        toast.success(`邀请链接已生成：${url}`);
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(slug) });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"][":id"].disable.$patch({
          param: { id, slug },
        }),
        "禁用失败",
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "禁用失败"),
    onSuccess: () => {
      toast.success("已禁用");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(slug) });
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"][":id"].enable.$patch({
          param: { id, slug },
        }),
        "启用失败",
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "启用失败"),
    onSuccess: () => {
      toast.success("已启用");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(slug) });
    },
  });

  const links = linksData?.links ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LinkIcon /> 邀请链接
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>共享邀请链接</DialogTitle>
          <DialogDescription>
            生成的链接可重复使用、永不过期；任何打开链接的用户登录后会以 HR 角色加入工作区。
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
            生成新链接
          </Button>
        </div>

        {isPending ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-2">
            {links.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">还没有邀请链接</div>
            ) : (
              links.map((link) => (
                <LinkRow
                  expanded={expandedId === link.id}
                  key={link.id}
                  link={link}
                  onCopy={() => copyInviteUrl(link.code)}
                  onDisable={() => disableMutation.mutate(link.id)}
                  onEnable={() => enableMutation.mutate(link.id)}
                  onToggleExpand={() => setExpandedId((cur) => (cur === link.id ? null : link.id))}
                  slug={slug}
                />
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
