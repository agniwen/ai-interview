"use client";

import { IconCopy, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceId, useWorkspaceMemberRole } from "@/lib/client/workspace-context";
import { roles } from "@arc/shared/permissions";
import { WORKSPACE_ROLES, getWorkspaceRoleLabel } from "./role-display";
import {
  BUILT_IN_WORKSPACE_ROLE_NAMES,
  buildPermissionHeaderGroups,
  buildPermissionItems,
  canManageWorkspacePermissions,
  copyPermissionRecord,
  hasPermissionAction,
  normalizeDynamicRoleName,
  readRoleDeleteError,
  togglePermissionAction,
} from "./workspace-role-permissions";
import type { PermissionItem, PermissionRecord } from "./workspace-role-permissions";

interface DynamicWorkspaceRole {
  id: string;
  name: string;
  role: string;
  permission: PermissionRecord;
}

interface PermissionRoleRow {
  builtIn: boolean;
  id: string;
  name: string;
  permission: PermissionRecord;
  role: string;
}

type RoleFormMode = "create" | "edit" | "copy";

interface WorkspacePermissionsSectionProps {
  headerRender?: (props: { actionRender: ReactNode }) => ReactNode;
}

interface RoleFormState {
  mode: RoleFormMode;
  permission?: PermissionRecord;
  role?: DynamicWorkspaceRole | PermissionRoleRow;
}

interface RoleFormSubmit {
  name: string;
  permission: PermissionRecord;
  role: string;
}

interface UpdateRoleInput {
  id: string;
  name?: string;
  permission: PermissionRecord;
  role?: string;
}

function getBuiltInPermission(role: keyof typeof roles): PermissionRecord {
  return copyPermissionRecord(roles[role].statements as unknown as PermissionRecord);
}

function readError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message?: string };
    if (message) {
      return message;
    }
  }
  return fallback;
}

function copyPermission(permission: PermissionRecord | null | undefined): PermissionRecord {
  return copyPermissionRecord(permission);
}

function PermissionHeaderLabel({ item }: { item: PermissionItem }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center justify-center border-muted-foreground/60 border-b border-dotted leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {item.actionLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left leading-relaxed" side="top">
        {item.description}
      </TooltipContent>
    </Tooltip>
  );
}

function PermissionCell({
  checked,
  disabled,
  item,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  item: PermissionItem;
  onToggle?: () => void;
}) {
  const label = checked ? "允许" : "不允许";
  return (
    <div
      className="flex min-h-10 cursor-default items-center justify-center px-2 py-1.5 text-center"
      title={`${item.label}: ${label}`}
    >
      <Checkbox
        aria-label={`${item.label}: ${label}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={() => onToggle?.()}
      />
    </div>
  );
}

function getRoleFormText(mode: RoleFormMode) {
  if (mode === "edit") {
    return {
      description: "修改角色名称和标识，保存后会更新当前角色。",
      submitLabel: "保存角色",
      title: "编辑角色",
    };
  }
  if (mode === "copy") {
    return {
      description: "填写新角色名称和标识，权限会从当前角色复制。",
      submitLabel: "复制角色",
      title: "复制角色",
    };
  }
  return {
    description: "填写角色名称和标识，创建后即可在表格中配置权限。",
    submitLabel: "创建角色",
    title: "新建角色",
  };
}

function RoleFormDialog({
  onOpenChange,
  onSubmit,
  open,
  state,
  submitting,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: RoleFormSubmit) => void;
  open: boolean;
  state: RoleFormState | null;
  submitting: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [roleIdentifier, setRoleIdentifier] = useState("");
  const [roleName, setRoleName] = useState("");

  useEffect(() => {
    if (!state) {
      return;
    }

    const sourceRole = state.role?.role ?? "";
    const sourceName = state.role?.name ?? "";
    const defaultName = state.mode === "copy" ? `${sourceName} 副本`.trim() : sourceName;
    const defaultRole = state.mode === "copy" ? `${sourceRole}-copy` : sourceRole;
    setError(null);
    setRoleName(defaultName);
    setRoleIdentifier(defaultRole);
  }, [state]);

  const { description, submitLabel, title } = getRoleFormText(state?.mode ?? "create");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state) {
      return;
    }

    const name = roleName.trim();
    const role = normalizeDynamicRoleName(roleIdentifier);
    if (!name) {
      setError("请输入角色名称。");
      return;
    }
    if (!role) {
      setError("请输入角色标识。");
      return;
    }
    if (BUILT_IN_WORKSPACE_ROLE_NAMES.has(role)) {
      setError("不能使用系统内置角色名。");
      return;
    }

    setError(null);
    onSubmit({
      name,
      permission: copyPermission(state.permission),
      role,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="workspace-role-name">角色名称</FieldLabel>
              <Input
                autoFocus
                disabled={submitting}
                id="workspace-role-name"
                onChange={(event) => setRoleName(event.target.value)}
                placeholder="例如：面试审核员"
                value={roleName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="workspace-role-identifier">角色标识</FieldLabel>
              <Input
                disabled={submitting}
                id="workspace-role-identifier"
                onChange={(event) => setRoleIdentifier(event.target.value)}
                placeholder="例如：interview-reviewer"
                value={roleIdentifier}
              />
              <FieldDescription>名称用于展示，标识用于权限判断和成员角色值。</FieldDescription>
            </Field>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspacePermissionsSection({ headerRender }: WorkspacePermissionsSectionProps) {
  const workspaceId = useWorkspaceId();
  const currentRole = useWorkspaceMemberRole();
  const canManage = canManageWorkspacePermissions(currentRole);
  const queryClient = useQueryClient();
  const queryKey = ["workspace-dynamic-roles", workspaceId] as const;
  const permissionItems = useMemo(() => buildPermissionItems(), []);
  const permissionHeaderGroups = useMemo(
    () => buildPermissionHeaderGroups(permissionItems),
    [permissionItems],
  );
  const [deleteTarget, setDeleteTarget] = useState<DynamicWorkspaceRole | null>(null);
  const [draftByRoleId, setDraftByRoleId] = useState<Record<string, PermissionRecord>>({});
  const [roleFormState, setRoleFormState] = useState<RoleFormState | null>(null);

  const { data: dynamicRoles = [], isPending } = useQuery({
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listRoles({
        query: { organizationId: workspaceId },
      });
      if (error) {
        throw new Error(error.message ?? "加载角色失败");
      }
      return (data ?? []) as DynamicWorkspaceRole[];
    },
    queryKey,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setDraftByRoleId(
      Object.fromEntries(dynamicRoles.map((role) => [role.id, copyPermission(role.permission)])),
    );
  }, [dynamicRoles]);

  const createRole = useMutation({
    mutationFn: async (input: RoleFormSubmit) => {
      const role = normalizeDynamicRoleName(input.role);
      if (!role) {
        throw new Error("请输入角色标识。");
      }
      if (BUILT_IN_WORKSPACE_ROLE_NAMES.has(role)) {
        throw new Error("不能使用系统内置角色名。");
      }
      const { error } = await authClient.organization.createRole({
        additionalFields: { name: input.name },
        organizationId: workspaceId,
        permission: input.permission,
        role,
      });
      if (error) {
        throw new Error(error.message ?? "创建角色失败");
      }
    },
    onError(error) {
      toast.error(readError(error, "创建角色失败"));
    },
    async onSuccess() {
      setRoleFormState(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("角色已创建");
    },
  });

  const updateRole = useMutation({
    mutationFn: async (input: UpdateRoleInput) => {
      const data: {
        name?: string;
        permission: PermissionRecord;
        roleName?: string;
      } = { permission: input.permission };
      if (input.role) {
        data.roleName = input.role;
      }
      if (input.name) {
        data.name = input.name;
      }
      const { error } = await authClient.organization.updateRole({
        data,
        organizationId: workspaceId,
        roleId: input.id,
      });
      if (error) {
        throw new Error(error.message ?? "保存权限失败");
      }
    },
    onError(error) {
      toast.error(readError(error, "保存权限失败"));
    },
    async onSuccess() {
      setRoleFormState(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("权限已保存");
    },
  });

  const deleteRole = useMutation({
    mutationFn: async (role: DynamicWorkspaceRole) => {
      const { error } = await authClient.organization.deleteRole({
        organizationId: workspaceId,
        roleId: role.id,
      });
      if (error) {
        throw new Error(readRoleDeleteError(error));
      }
    },
    onError(error) {
      toast.error(readRoleDeleteError(error));
    },
    async onSuccess() {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
      toast.success("角色已删除");
    },
  });

  const roleFormSubmitting = createRole.isPending || updateRole.isPending;
  const createRoleAction = canManage ? (
    <Button
      className="w-full sm:w-auto"
      disabled={roleFormSubmitting}
      onClick={() => setRoleFormState({ mode: "create", permission: {} })}
      type="button"
    >
      <IconPlus data-icon="inline-start" />
      新建角色
    </Button>
  ) : null;
  const header = headerRender?.({ actionRender: createRoleAction });

  if (!canManage) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert>
          <AlertTitle>没有权限管理权限</AlertTitle>
          <AlertDescription>只有工作区拥有者和管理员可以配置工作区角色权限。</AlertDescription>
        </Alert>
      </div>
    );
  }

  const roleRows: PermissionRoleRow[] = [
    ...WORKSPACE_ROLES.map((role) => ({
      builtIn: true,
      id: `builtin:${role}`,
      name: getWorkspaceRoleLabel(role),
      permission: getBuiltInPermission(role),
      role,
    })),
    ...dynamicRoles.map((role) => ({
      builtIn: false,
      id: role.id,
      name: role.name,
      permission: draftByRoleId[role.id] ?? copyPermissionRecord(role.permission),
      role: role.role,
    })),
  ];

  const savingRoleId = updateRole.isPending ? updateRole.variables?.id : null;
  const deletingRoleId = deleteRole.isPending ? deleteRole.variables?.id : null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <section className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted">
                  <th
                    className="sticky left-0 z-20 min-w-68 border-r bg-muted px-3 py-2 text-left align-middle font-medium"
                    rowSpan={2}
                    scope="col"
                  >
                    角色
                  </th>
                  {permissionHeaderGroups.map((group) => (
                    <th
                      className="border-l px-2 py-2 text-center font-medium"
                      colSpan={group.items.length}
                      key={group.resource}
                      scope="colgroup"
                    >
                      {group.resourceLabel}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted">
                  {permissionHeaderGroups.flatMap((group) =>
                    group.items.map((item) => (
                      <th
                        className="min-w-20 border-l px-2 py-1.5 text-center font-medium text-muted-foreground text-xs"
                        key={item.key}
                        scope="col"
                      >
                        <PermissionHeaderLabel item={item} />
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {roleRows.map((row) => {
                  const dynamicRole = dynamicRoles.find((role) => role.id === row.id) ?? null;
                  const rowBusy = savingRoleId === row.id || deletingRoleId === row.id;
                  return (
                    <tr className="border-b last:border-b-0" key={row.id}>
                      <th
                        aria-label={`角色 ${row.name}`}
                        className="sticky left-0 z-10 border-r bg-background px-3 py-2 text-left align-top font-medium"
                        scope="row"
                      >
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{row.name}</span>
                                <Badge variant={row.builtIn ? "secondary" : "outline"}>
                                  {row.builtIn ? "内置" : "自定义"}
                                </Badge>
                              </div>
                              <span className="block truncate text-muted-foreground text-xs">
                                {row.role}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                aria-label={`复制角色 ${row.name}`}
                                disabled={roleFormSubmitting}
                                onClick={() =>
                                  setRoleFormState({
                                    mode: "copy",
                                    permission: row.permission,
                                    role: row,
                                  })
                                }
                                size="icon-xs"
                                title="复制角色"
                                type="button"
                                variant="ghost"
                              >
                                <IconCopy />
                              </Button>
                              {dynamicRole ? (
                                <>
                                  <Button
                                    aria-label={`编辑角色 ${row.name}`}
                                    disabled={rowBusy || roleFormSubmitting}
                                    onClick={() =>
                                      setRoleFormState({
                                        mode: "edit",
                                        permission: row.permission,
                                        role: dynamicRole,
                                      })
                                    }
                                    size="icon-xs"
                                    title="编辑角色"
                                    type="button"
                                    variant="ghost"
                                  >
                                    <IconPencil />
                                  </Button>
                                  <Button
                                    aria-label={`删除角色 ${row.name}`}
                                    disabled={rowBusy}
                                    onClick={() => setDeleteTarget(dynamicRole)}
                                    size="icon-xs"
                                    title="删除角色"
                                    type="button"
                                    variant="ghost"
                                  >
                                    {deletingRoleId === row.id ? <Spinner /> : <IconTrash />}
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </th>
                      {permissionItems.map((item) => {
                        const checked = hasPermissionAction(
                          row.permission,
                          item.resource,
                          item.action,
                        );
                        return (
                          <td className="border-l align-middle" key={`${row.id}:${item.key}`}>
                            <PermissionCell
                              checked={checked}
                              disabled={row.builtIn || rowBusy}
                              item={item}
                              onToggle={() => {
                                if (!dynamicRole) {
                                  return;
                                }
                                const currentPermission =
                                  draftByRoleId[dynamicRole.id] ?? dynamicRole.permission;
                                const nextPermission = togglePermissionAction(
                                  currentPermission,
                                  item.resource,
                                  item.action,
                                );
                                setDraftByRoleId((current) => ({
                                  ...current,
                                  [dynamicRole.id]: nextPermission,
                                }));
                                updateRole.mutate({
                                  id: dynamicRole.id,
                                  permission: nextPermission,
                                });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner data-icon="inline-start" />
            加载自定义角色
          </div>
        ) : null}

        {dynamicRoles.length === 0 && !isPending ? (
          <Empty>
            <EmptyContent>
              <EmptyTitle>还没有自定义角色</EmptyTitle>
              <EmptyDescription>
                内置角色会保留在表格中作为基准；创建自定义角色后即可在同一张表里配置权限。
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : null}
      </section>

      <RoleFormDialog
        onOpenChange={(open) => {
          if (!open) {
            setRoleFormState(null);
          }
        }}
        onSubmit={(input) => {
          if (
            roleFormState?.mode === "edit" &&
            roleFormState.role &&
            !("builtIn" in roleFormState.role)
          ) {
            updateRole.mutate({
              id: roleFormState.role.id,
              name: input.name,
              permission: input.permission,
              role: input.role === roleFormState.role.role ? undefined : input.role,
            });
            return;
          }
          createRole.mutate(input);
        }}
        open={Boolean(roleFormState)}
        state={roleFormState}
        submitting={roleFormSubmitting}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deleteRole.isPending) {
            setDeleteTarget(null);
          }
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除角色</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该角色的权限配置会被移除，此操作需要确认后执行。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRole.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteRole.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) {
                  deleteRole.mutate(deleteTarget);
                }
              }}
              variant="destructive"
            >
              {deleteRole.isPending ? <Spinner data-icon="inline-start" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
