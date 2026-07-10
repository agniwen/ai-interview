import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";

export type ResumeDetailDefaultTab = "overview" | "rounds" | "human-interview" | "offer";

export interface ResumeLibraryCardProps {
  canCreateChat: boolean;
  canCreateInterview: boolean;
  canDeleteResumeLibrary: boolean;
  canUpdateResumeLibrary: boolean;
  currentMemberRole: string;
  currentUserId: string | null;
  onCopyDetailLink: (record: ResumeLibraryListRecord) => void;
  onDelete: (record: ResumeLibraryListRecord) => void;
  onEdit: (record: ResumeLibraryListRecord) => void;
  onLaunchChat: (record: ResumeLibraryListRecord) => void;
  onLaunchInterview: (record: ResumeLibraryListRecord) => void;
  onOpenDetail: (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => void;
  onPreviewResume: (record: ResumeLibraryListRecord) => void;
  onSelectChange: (checked: boolean) => void;
  onShowDuplicateMatches: (record: ResumeLibraryListRecord) => void;
  onTransition: (record: ResumeLibraryListRecord, mode: "close" | "reactivate") => void;
  onViewJobDescription: (id: string) => void;
  record: ResumeLibraryListRecord;
  selected: boolean;
}
