import { MeetingLibraryPage } from "@/components/features/meeting/meeting-library-page";
import { MeetingSidebarSlots } from "@/components/features/meeting/meeting-sidebar-slots";

export function MeetingLibraryRoutePage() {
  return (
    <>
      <MeetingSidebarSlots />
      <MeetingLibraryPage />
    </>
  );
}
