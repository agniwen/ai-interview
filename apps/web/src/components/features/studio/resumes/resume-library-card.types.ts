import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";

export type ResumeDetailDefaultTab =
  | "overview"
  | "ai-analysis"
  | "rounds"
  | "human-interview"
  | "offer";

export interface ResumeLibraryCardProps {
  canCreateInterview: boolean;
  canDeleteResumeLibrary: boolean;
  canForceReparse: boolean;
  canRetryResumeParse: boolean;
  canUpdateResumeLibrary: boolean;
  currentMemberRole: string;
  currentUserId: string | null;
  onCopyDetailLink: (record: ResumeLibraryListRecord) => void;
  onDelete: (record: ResumeLibraryListRecord) => void;
  onEdit: (record: ResumeLibraryListRecord) => void;
  onForceReparse: (record: ResumeLibraryListRecord) => void;
  onLaunchInterview: (record: ResumeLibraryListRecord) => void;
  onOpenDetail: (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => void;
  onPreviewResume: (record: ResumeLibraryListRecord) => void;
  onRetryParse: (record: ResumeLibraryListRecord) => void;
  onSelectChange: (recordId: string, checked: boolean) => void;
  onShowDuplicateMatches: (record: ResumeLibraryListRecord) => void;
  onTransition: (record: ResumeLibraryListRecord, mode: "close" | "reactivate") => void;
  record: ResumeLibraryListRecord;
  retrying: boolean;
  selected: boolean;
}
