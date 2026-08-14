import { MeetingMorePage } from "@/components/features/meeting/meeting-more-page";
import { MeetingSidebarSlots } from "@/components/features/meeting/meeting-sidebar-slots";

export function MeetingMoreRoutePage({
  meetingId,
  seekToSeconds,
}: {
  meetingId: string;
  seekToSeconds?: number;
}) {
  return (
    <>
      <MeetingSidebarSlots />
      <MeetingMorePage meetingId={meetingId} seekToSeconds={seekToSeconds} />
    </>
  );
}
