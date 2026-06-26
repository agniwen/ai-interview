"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BanIcon,
  CopyIcon,
  LinkIcon,
  PencilIcon,
  PlayIcon,
  UsersIcon,
} from "@/components/icons/hugeicons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TimeDisplay } from "@/components/features/display/time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  ASSIGNABLE_ROLES,
  buildWorkspaceRoleOptions,
  getWorkspaceRoleDescription,
} from "./role-display";
import type { WorkspaceRoleOption } from "./role-display";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";

interface InviteLinkDto {
  id: string;
  code: string;
  createdAt: string;
  createdBy: string | null;
  creatorName: string | null;
  disabledAt: string | null;
  initialRole: string;
  joinedCount: number;
}

interface LinkMemberDto {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
}

const QUERY_KEY = (slug: string) => ["invite-links", slug] as const;

function getDefaultInviteLinkRole(assignableRoles: readonly string[]): string {
  return assignableRoles.includes(NO_ACCESS_WORKSPACE_ROLE)
    ? NO_ACCESS_WORKSPACE_ROLE
    : (assignableRoles[0] ?? NO_ACCESS_WORKSPACE_ROLE);
}

interface InviteLinkRoleDialogProps {
  actionLabel: string;
  assignableRoleOptions?: readonly WorkspaceRoleOption[];
  assignableRoles: readonly string[];
  description: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (initialRole: string) => void;
  open: boolean;
  pending: boolean;
  title: string;
  value: string;
  onValueChange: (value: string) => void;
}

function InviteLinkRoleDialog({
  actionLabel,
  assignableRoleOptions,
  assignableRoles,
  description,
  onOpenChange,
  onSubmit,
  open,
  pending,
  title,
  value,
  onValueChange,
}: InviteLinkRoleDialogProps) {
  const canSubmit = assignableRoles.includes(value);
  const roleOptions = assignableRoleOptions ?? buildWorkspaceRoleOptions(assignableRoles);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="invite-link-initial-role">初始化角色</FieldLabel>
          <Select
            disabled={assignableRoles.length === 0}
            value={value}
            onValueChange={onValueChange}
          >
            <SelectTrigger className="w-full" id="invite-link-initial-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{getWorkspaceRoleDescription(value)}</FieldDescription>
        </Field>
        <DialogFooter>
          <Button disabled={pending || !canSubmit} onClick={() => onSubmit(value)}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  onEdit: () => void;
  onEnable: () => void;
  onToggleExpand: () => void;
  roleLabelByValue: ReadonlyMap<string, string>;
}

function LinkRow({
  link,
  expanded,
  slug,
  onCopy,
  onDisable,
  onEdit,
  onEnable,
  onToggleExpand,
  roleLabelByValue,
}: LinkRowProps) {
  const url =
    typeof window === "undefined"
      ? `/join/${link.code}`
      : `${window.location.origin}/join/${link.code}`;
  const disabled = Boolean(link.disabledAt);
  return (
    <Card className="min-w-0 gap-0 rounded-lg py-0">
      <CardContent className="min-w-0 p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm">{url}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {link.creatorName ?? "已删除用户"} · <TimeDisplay value={link.createdAt} />
              {disabled ? " · 已禁用" : ""}
            </div>
            <div className="mt-2">
              <Badge variant="outline">
                初始化角色：{roleLabelByValue.get(link.initialRole) ?? link.initialRole}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button aria-label="复制链接" onClick={onCopy} size="icon-sm" variant="ghost">
              <CopyIcon />
            </Button>
            <Button aria-label="编辑初始化角色" onClick={onEdit} size="icon-sm" variant="ghost">
              <PencilIcon />
            </Button>
            <Button aria-label="查看加入成员" onClick={onToggleExpand} size="sm" variant="ghost">
              <UsersIcon /> {link.joinedCount}
            </Button>
            {disabled ? (
              <Button aria-label="启用链接" onClick={onEnable} size="icon-sm" variant="ghost">
                <PlayIcon />
              </Button>
            ) : (
              <Button aria-label="禁用链接" onClick={onDisable} size="icon-sm" variant="ghost">
                <BanIcon />
              </Button>
            )}
          </div>
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

export function InviteLinksDialog({
  assignableRoleOptions,
  assignableRoles = ASSIGNABLE_ROLES,
}: {
  assignableRoleOptions?: readonly WorkspaceRoleOption[];
  assignableRoles?: readonly string[];
}) {
  const roleOptions = assignableRoleOptions ?? buildWorkspaceRoleOptions(assignableRoles);
  const roleLabelByValue = new Map(roleOptions.map((role) => [role.value, role.label]));
  const [open, setOpen] = useState(false);
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState(() => getDefaultInviteLinkRole(assignableRoles));
  const [editTarget, setEditTarget] = useState<InviteLinkDto | null>(null);
  const [editRole, setEditRole] = useState(() => getDefaultInviteLinkRole(assignableRoles));

  useEffect(() => {
    if (createOpen) {
      setCreateRole(getDefaultInviteLinkRole(assignableRoles));
    }
  }, [assignableRoles, createOpen]);

  useEffect(() => {
    if (editTarget) {
      setEditRole(editTarget.initialRole);
    }
  }, [editTarget]);

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
    mutationFn: (initialRole: string) =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"].$post({
          json: { initialRole },
          param: { slug },
        }),
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
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(slug) });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, initialRole }: { id: string; initialRole: string }) =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"][":id"].$patch({
          json: { initialRole },
          param: { id, slug },
        }),
        "更新初始化角色失败",
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "更新失败"),
    onSuccess: () => {
      toast.success("初始化角色已更新");
      setEditTarget(null);
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
      <DialogContent className="w-[min(calc(100vw-2rem),56rem)] overflow-hidden sm:max-w-none">
        <DialogHeader>
          <DialogTitle>共享邀请链接</DialogTitle>
          <DialogDescription>
            生成的链接可重复使用、永不过期；用户登录后会按链接设置的初始化角色加入工作区。
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button disabled={assignableRoles.length === 0} onClick={() => setCreateOpen(true)}>
            生成新链接
          </Button>
        </div>

        {isPending ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
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
                  onEdit={() => setEditTarget(link)}
                  onEnable={() => enableMutation.mutate(link.id)}
                  onToggleExpand={() => setExpandedId((cur) => (cur === link.id ? null : link.id))}
                  roleLabelByValue={roleLabelByValue}
                  slug={slug}
                />
              ))
            )}
          </div>
        )}
      </DialogContent>
      <InviteLinkRoleDialog
        actionLabel="生成链接"
        assignableRoleOptions={assignableRoleOptions}
        assignableRoles={assignableRoles}
        description="选择通过这个链接加入工作区后的初始化角色。"
        onOpenChange={setCreateOpen}
        onSubmit={(initialRole) => createMutation.mutate(initialRole)}
        onValueChange={setCreateRole}
        open={createOpen}
        pending={createMutation.isPending}
        title="生成邀请链接"
        value={createRole}
      />
      <InviteLinkRoleDialog
        actionLabel="保存"
        assignableRoleOptions={assignableRoleOptions}
        assignableRoles={assignableRoles}
        description="已通过该链接加入的成员不会被自动改角色。"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditTarget(null);
          }
        }}
        onSubmit={(initialRole) => {
          if (editTarget) {
            updateRoleMutation.mutate({ id: editTarget.id, initialRole });
          }
        }}
        onValueChange={setEditRole}
        open={Boolean(editTarget)}
        pending={updateRoleMutation.isPending}
        title="编辑初始化角色"
        value={editRole}
      />
    </Dialog>
  );
}
