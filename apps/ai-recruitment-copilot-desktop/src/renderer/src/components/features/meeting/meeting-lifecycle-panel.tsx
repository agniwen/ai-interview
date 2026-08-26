import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FrameHeading,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { desktopMeetingKeys, restoreMeeting, trashMeeting } from "@/lib/client/meetings";
import { showMeetingArchivedToast } from "./meeting-archive-toast";

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
  const refreshMeetingLists = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.all(slug) }),
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.trash(slug) }),
    ]);
  const restoreMutation = useMutation({
    mutationFn: (_toastId: string | number) => restoreMeeting(slug, meetingId),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "撤回归档失败");
    },
    onSuccess: async (_, toastId) => {
      await refreshMeetingLists();
      toast.dismiss(toastId);
    },
  });
  const trashMutation = useMutation({
    mutationFn: () => trashMeeting(slug, meetingId),
    onSuccess: async () => {
      await refreshMeetingLists();
      showMeetingArchivedToast((toastId) => restoreMutation.mutate(toastId));
      await navigate({ to: "/meetings" });
    },
  });
  if (!canManageMeetingLifecycle(accessRole)) {
    return null;
  }
  return (
    <Frame>
      <FrameHeader>
        <FrameHeading>
          <FrameTitle>会议生命周期</FrameTitle>
          <FrameDescription>归档后可在七天内恢复。</FrameDescription>
        </FrameHeading>
      </FrameHeader>
      <FramePanel className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-muted-foreground text-sm">
          从列表中移除这次录制。七天内可在归档记录恢复，之后将永久清除。
        </p>
        <Button
          className="shrink-0"
          disabled={trashMutation.isPending}
          onClick={() => trashMutation.mutate()}
          type="button"
          variant="destructive"
        >
          {trashMutation.isPending ? "正在归档…" : "归档"}
        </Button>
        {trashMutation.error ? (
          <p className="w-full text-destructive text-xs">
            {trashMutation.error instanceof Error ? trashMutation.error.message : "归档失败"}
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}
