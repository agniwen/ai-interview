import { IconUsers } from "@tabler/icons-react";
import { getRecruitingBoardViewLabel } from "@app/shared/recruiting-board";
import { ResumeUploadEntryButton } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function ResumeLibraryPageEmptyState({
  canUploadResumeLibrary,
  hrHandling = false,
  onOpenUploadEntry,
  stageFilter,
  uploadEntryDisabled,
}: {
  canUploadResumeLibrary: boolean;
  hrHandling?: boolean;
  onOpenUploadEntry: () => void;
  stageFilter: string;
  uploadEntryDisabled: boolean;
}) {
  const stageLabel = getRecruitingBoardViewLabel(stageFilter);
  return (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconUsers className="size-5" />
        </EmptyMedia>
        <EmptyTitle>
          {hrHandling
            ? `「${stageLabel}」暂无需要 HR 处理的候选人`
            : `「${stageLabel}」阶段暂无候选人`}
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        {canUploadResumeLibrary && !stageFilter ? (
          <ResumeUploadEntryButton disabled={uploadEntryDisabled} onClick={onOpenUploadEntry} />
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
