import { MeetingDetailPage } from "@/components/features/meeting/meeting-detail-page";
import { MeetingSidebarSlots } from "@/components/features/meeting/meeting-sidebar-slots";

export function MeetingDetailRoutePage({
  meetingId,
  seekToSeconds,
}: {
  meetingId: string;
  seekToSeconds?: number;
}) {
  return (
    <>
      <MeetingSidebarSlots />
      <MeetingDetailPage meetingId={meetingId} seekToSeconds={seekToSeconds} />
    </>
  );
}
