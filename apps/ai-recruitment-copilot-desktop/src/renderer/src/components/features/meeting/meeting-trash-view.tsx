import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrashedMeetingItem } from "@arc/shared/meeting-recording";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { desktopMeetingKeys, purgeMeeting, restoreMeeting } from "@/lib/client/meetings";

export function MeetingTrashView({
  meetings,
  slug,
}: {
  meetings: TrashedMeetingItem[];
  slug: string;
}) {
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.all(slug) }),
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.trash(slug) }),
    ]);
  const restoreMutation = useMutation({
    mutationFn: (meetingId: string) => restoreMeeting(slug, meetingId),
    onSuccess: invalidate,
  });
  const purgeMutation = useMutation({
    mutationFn: (meetingId: string) => purgeMeeting(slug, meetingId),
    onSuccess: async () => {
      setConfirmPurgeId(null);
      await invalidate();
    },
  });
  if (meetings.length === 0) {
    return <p className="py-12 text-center text-muted-foreground text-sm">废纸篓为空</p>;
  }
  return (
    <div className="grid gap-3">
      {meetings.map((meeting) => (
        <article className="rounded-2xl border border-border/70 p-4" key={meeting.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium text-sm">{meeting.title}</h2>
              <p className="mt-1 text-muted-foreground text-xs">
                {meeting.creator.name} · 将于 {new Date(meeting.purgeAfter).toLocaleString("zh-CN")}{" "}
                永久清除
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={restoreMutation.isPending || purgeMutation.isPending}
                onClick={() => restoreMutation.mutate(meeting.id)}
                type="button"
                variant="outline"
              >
                恢复
              </Button>
              <Button
                disabled={restoreMutation.isPending || purgeMutation.isPending}
                onClick={() => {
                  if (confirmPurgeId === meeting.id) {
                    purgeMutation.mutate(meeting.id);
                    return;
                  }
                  setConfirmPurgeId(meeting.id);
                }}
                type="button"
                variant="destructive"
              >
                {confirmPurgeId === meeting.id ? "确认永久清除" : "永久清除"}
              </Button>
            </div>
          </div>
        </article>
      ))}
      {restoreMutation.error || purgeMutation.error ? (
        <p className="text-destructive text-sm">
          {(restoreMutation.error ?? purgeMutation.error) instanceof Error
            ? (restoreMutation.error ?? purgeMutation.error)?.message
            : "更新会议废纸篓失败"}
        </p>
      ) : null}
    </div>
  );
}
