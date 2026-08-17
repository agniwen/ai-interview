import { IconUsers } from "@tabler/icons-react";
import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import { ResumeUploadEntryButton } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function ResumeLibraryPageEmptyState({
  canUploadResumeLibrary,
  onOpenUploadEntry,
  stageFilter,
  uploadEntryDisabled,
}: {
  canUploadResumeLibrary: boolean;
  onOpenUploadEntry: () => void;
  stageFilter: string;
  uploadEntryDisabled: boolean;
}) {
  const stageLabel = Object.entries(pipelineStageMeta).find(([stage]) => stage === stageFilter)?.[1]
    ?.label;
  if (stageFilter) {
    return (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconUsers className="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            暂无处于「
            {stageLabel ?? stageFilter}
            」阶段的候选人
          </EmptyTitle>
          <EmptyDescription>切换到其他阶段或「全部」查看更多候选人。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconUsers className="size-5" />
        </EmptyMedia>
        <EmptyTitle>招聘台还没有任何候选人</EmptyTitle>
        <EmptyDescription>点击右上角「上传简历」加入第一份候选人简历。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canUploadResumeLibrary ? (
          <ResumeUploadEntryButton disabled={uploadEntryDisabled} onClick={onOpenUploadEntry} />
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
