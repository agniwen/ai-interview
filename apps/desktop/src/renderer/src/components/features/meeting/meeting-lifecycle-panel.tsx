import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { MeetingAccessRole } from "@app/shared/meeting-recording";
import { SettingsRow } from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { desktopMeetingKeys, restoreMeeting, trashMeeting } from "@/lib/client/meetings";
import { showMeetingArchivedToast } from "./meeting-archive-toast";
import { showMeetingDeletionError } from "./meeting-deletion-toast";

export function canManageMeetingLifecycle(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}

/**
 * Owner/Admin 的删除入口。客户端角色判断只控制可见性，服务端仍在事务中重新验证权限。
 */
export function MeetingDeleteAction({
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
      showMeetingDeletionError(error instanceof Error ? error.message : "撤销删除失败");
    },
    onSuccess: async (_, toastId) => {
      await refreshMeetingLists();
      toast.dismiss(toastId);
    },
  });
  const trashMutation = useMutation({
    mutationFn: () => trashMeeting(slug, meetingId),
    onError: (error) => {
      showMeetingDeletionError(error instanceof Error ? error.message : "删除录制失败");
    },
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
    <SettingsRow description="删除后七天内可以恢复" label="删除录制">
      <div className="flex justify-end">
        <Button
          disabled={trashMutation.isPending}
          onClick={() => trashMutation.mutate()}
          size="sm"
          type="button"
          variant="destructive"
        >
          {trashMutation.isPending ? "正在删除…" : "删除"}
        </Button>
      </div>
    </SettingsRow>
  );
}
