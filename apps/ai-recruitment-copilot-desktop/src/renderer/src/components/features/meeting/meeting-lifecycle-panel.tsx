import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import { desktopMeetingKeys, trashMeeting } from "@/lib/client/meetings";

export function canManageMeetingLifecycle(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}

/**
 * Owner/Admin 的生命周期入口。客户端角色判断只控制可见性，服务端仍在事务中重新验证权限。
 * Lifecycle affordance for owners/admins; client role checks control visibility while the server revalidates authority transactionally.
 */
export function MeetingLifecyclePanel({
  accessRole,
  meetingId,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  slug: string;
}) {
  const navigate = useNavigate({ from: "/meetings/$meetingId" });
  const queryClient = useQueryClient();
  const trashMutation = useMutation({
    mutationFn: () => trashMeeting(slug, meetingId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.all(slug) }),
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.trash(slug) }),
      ]);
      await navigate({ to: "/meetings" });
    },
  });
  if (!canManageMeetingLifecycle(accessRole)) {
    return null;
  }
  return (
    <section className="rounded-2xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm">会议生命周期</h2>
          <p className="mt-1 text-muted-foreground text-xs">移入废纸篓后可在七天内恢复。</p>
        </div>
        <Button
          disabled={trashMutation.isPending}
          onClick={() => trashMutation.mutate()}
          type="button"
          variant="destructive"
        >
          {trashMutation.isPending ? "正在移入…" : "移入废纸篓"}
        </Button>
      </div>
      {trashMutation.error ? (
        <p className="mt-2 text-destructive text-xs">
          {trashMutation.error instanceof Error ? trashMutation.error.message : "移入废纸篓失败"}
        </p>
      ) : null}
    </section>
  );
}
