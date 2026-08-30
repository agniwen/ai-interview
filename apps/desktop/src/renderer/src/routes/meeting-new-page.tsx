import { MeetingSidebarSlots } from "@/components/features/meeting/meeting-sidebar-slots";
import { NewMeetingRecordingPage } from "@/components/features/meeting/new-meeting-recording-page";
import { usePreselectedResumeRecord } from "@/components/features/meeting/meeting-recording-context";

/**
 * `/meetings/new`：仅当 search 含 `resumeRecordId`（招聘台跳入）时展示关联招聘记录。
 */
export function MeetingNewRoutePage({ resumeRecordId }: { resumeRecordId?: string }) {
  const preselectedResumeRecord = usePreselectedResumeRecord();
  const linkRecruiting = Boolean(resumeRecordId);
  const matchedRecord =
    linkRecruiting && preselectedResumeRecord && preselectedResumeRecord.id === resumeRecordId
      ? preselectedResumeRecord
      : null;

  return (
    <>
      <MeetingSidebarSlots />
      <NewMeetingRecordingPage
        linkRecruiting={linkRecruiting}
        preselectedResumeId={resumeRecordId ?? null}
        preselectedResumeRecord={matchedRecord}
      />
    </>
  );
}
