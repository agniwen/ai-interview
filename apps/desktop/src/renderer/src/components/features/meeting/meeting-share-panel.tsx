import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { MeetingAccessRole, MeetingGrantRole } from "@app/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  desktopMeetingKeys,
  fetchMeetingShare,
  reassignMeetingOwner,
  updateMeetingShare,
} from "@/lib/client/meetings";
import { fetchWorkspaceMembers } from "@/lib/client/studio-resumes";

const meetingGrantRoleSchema = z.enum(["editor", "viewer"]);

export function canManageMeetingSharing(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}

/**
 * Meeting ACL 编辑器：restricted/workspace 可见性与显式 Viewer/Editor grant 组成同一次保存快照。
 * Meeting ACL editor saving visibility and explicit Viewer/Editor grants as one snapshot.
 *
 * Owner reassignment 只在服务端确认 Workspace-Custodied 后开放，普通会议不能借 UI 绕过 Creator 控制权。
 * Owner reassignment is available only for server-confirmed workspace custody, never as a shortcut around an active creator.
 */
export function MeetingSharePanel({
  accessRole,
  meetingId,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const enabled = canManageMeetingSharing(accessRole);
  const shareKey = desktopMeetingKeys.share(slug, meetingId);
  const shareQuery = useQuery({
    enabled,
    queryFn: () => fetchMeetingShare(slug, meetingId),
    queryKey: shareKey,
  });
  const membersQuery = useQuery({
    enabled,
    queryFn: () => fetchWorkspaceMembers(slug),
    queryKey: ["desktop-workspace-members", slug],
  });
  const [visibility, setVisibility] = useState<"restricted" | "workspace">("restricted");
  const [grants, setGrants] = useState<Record<string, MeetingGrantRole>>({});
  const [newOwnerId, setNewOwnerId] = useState("");
  useEffect(() => {
    if (!shareQuery.data) {
      return;
    }
    setVisibility(shareQuery.data.visibility);
    setGrants(
      Object.fromEntries(shareQuery.data.grants.map((grant) => [grant.member.id, grant.role])),
    );
  }, [shareQuery.data]);
  // visibility/grants 是可取消的本地工作副本；直到点击保存才整体提交。
  // visibility/grants form a cancellable local working copy submitted atomically on Save.
  const saveMutation = useMutation({
    mutationFn: () =>
      updateMeetingShare(slug, meetingId, {
        grants: Object.entries(grants).map(([userId, role]) => ({ role, userId })),
        visibility,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shareKey }),
  });
  const reassignMutation = useMutation({
    mutationFn: () => reassignMeetingOwner(slug, meetingId, newOwnerId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: shareKey }),
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.detail(slug, meetingId) }),
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.all(slug) }),
      ]);
    },
  });
  if (!enabled) {
    return null;
  }
  const members = (membersQuery.data ?? []).filter(
    (workspaceMember) => workspaceMember.id !== shareQuery.data?.owner.id,
  );
  const error =
    shareQuery.error ?? membersQuery.error ?? saveMutation.error ?? reassignMutation.error;
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4">
        <h2 className="font-medium">分享与权限</h2>
        <p className="text-muted-foreground text-xs">
          只可分享给当前 Workspace 成员，不会生成公开链接。
        </p>
      </div>
      {error ? (
        <p className="mb-3 text-destructive text-sm">
          {error instanceof Error ? error.message : "加载会议分享设置失败"}
        </p>
      ) : null}
      <label
        className="mb-4 flex items-center justify-between gap-4 text-sm"
        htmlFor="meeting-workspace-visibility"
      >
        <span>
          整个 Workspace 可查看
          <span className="block text-muted-foreground text-xs">
            启用后未单独授权的成员为 Viewer
          </span>
        </span>
        <Switch
          checked={visibility === "workspace"}
          id="meeting-workspace-visibility"
          onCheckedChange={(checked) => setVisibility(checked ? "workspace" : "restricted")}
        />
      </label>
      <div className="flex flex-col gap-2">
        {members.map((workspaceMember) => (
          <label
            className="flex items-center justify-between gap-3 text-sm"
            key={workspaceMember.id}
          >
            <span className="truncate">{workspaceMember.name}</span>
            <select
              className="h-9 rounded-md border bg-background px-2"
              onChange={(event) => {
                const role = event.currentTarget.value;
                setGrants((current) => {
                  if (role === "none") {
                    const next: Record<string, MeetingGrantRole> = {};
                    for (const [userId, grantRole] of Object.entries(current)) {
                      if (userId !== workspaceMember.id) {
                        next[userId] = grantRole;
                      }
                    }
                    return next;
                  }
                  const result = meetingGrantRoleSchema.safeParse(role);
                  return result.success
                    ? { ...current, [workspaceMember.id]: result.data }
                    : current;
                });
              }}
              value={grants[workspaceMember.id] ?? "none"}
            >
              <option value="none">未单独授权</option>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
        ))}
      </div>
      <Button
        className="mt-4"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "正在保存…" : "保存分享设置"}
      </Button>
      {accessRole === "administrator" && shareQuery.data?.workspaceCustodied ? (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 font-medium text-sm">Workspace-Custodied Meeting</p>
          <p className="mb-3 text-muted-foreground text-xs">
            原 Creator 已离开 Workspace，可重新分配 Owner。
          </p>
          <div className="flex gap-2">
            <select
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              onChange={(event) => setNewOwnerId(event.target.value)}
              value={newOwnerId}
            >
              <option value="">选择新 Owner</option>
              {members.map((workspaceMember) => (
                <option key={workspaceMember.id} value={workspaceMember.id}>
                  {workspaceMember.name}
                </option>
              ))}
            </select>
            <Button
              disabled={!newOwnerId || reassignMutation.isPending}
              onClick={() => reassignMutation.mutate()}
              variant="outline"
            >
              重新分配
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
