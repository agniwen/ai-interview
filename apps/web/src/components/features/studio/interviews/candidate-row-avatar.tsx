import type { StudioInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { cn } from "@app/shared/utils";

import { CandidateAvatar } from "@/components/features/studio/candidate-avatar-image";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import type { getResumeDocumentFileIconKind } from "@/components/features/resume/resume-document-file-icon";

/**
 * 候选人头像：优先显示简历头像，右下角叠加简历文件类型图标。
 * Candidate avatar (resume headshot when available) with the resume file type in the corner.
 */
export function CandidateRowAvatar({
  documentKind,
  muted = false,
  record,
}: {
  documentKind: ReturnType<typeof getResumeDocumentFileIconKind> | null;
  muted?: boolean;
  record: Pick<
    StudioInterviewRecordListRecord,
    "candidateAvatarVersion" | "candidateId" | "candidateName"
  >;
}) {
  return (
    <>
      <CandidateAvatar
        className="size-9 transition-transform duration-200 group-hover/avatar-preview:scale-105"
        label={record.candidateName || "候选人"}
        recordId={record.candidateId}
        seed={record.candidateName.trim() || "未命名候选人"}
        source="resumes"
        version={record.candidateAvatarVersion}
      />
      {documentKind ? (
        <span
          aria-hidden="true"
          className={cn("absolute -right-1 -bottom-1 z-10 flex", muted && "opacity-45 grayscale")}
        >
          <ResumeDocumentFileIcon className="size-4" kind={documentKind} />
        </span>
      ) : null}
    </>
  );
}
