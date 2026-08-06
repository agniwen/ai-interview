import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";

export interface UnifiedRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  resumeParseStatus?: ResumeLibraryDetail["resumeParseStatus"];
  resumeProfile: ResumeLibraryDetail["resumeProfile"];
  notes: string | null;
  hasResumeFile: boolean;
  creatorName: string | null;
  resumeStorageKey?: string | null;
  interviewQuestions?: StudioInterviewRoundDetail["candidate"]["interviewQuestions"];
  pipelineStage?: ResumeLibraryDetail["pipelineStage"];
  outcome?: ResumeLibraryDetail["outcome"];
  roundId?: string;
  roundLabel?: string;
  roundScheduledAt?: string | null;
  roundScheduledEndAt?: string | null;
  roundStatus?: StudioInterviewRoundDetail["status"];
  roundInterviewLink?: string;
  roundAllowTextInput?: boolean;
  roundCandidateFeedback?: StudioInterviewRoundDetail["candidateFeedback"];
  roundHasReport?: boolean;
}

export function toUnifiedRoundRecord(round: StudioInterviewRoundDetail): UnifiedRecord {
  return {
    candidateEmail: round.candidate.candidateEmail,
    candidateName: round.candidate.candidateName,
    candidatePhone: round.candidate.candidatePhone,
    creatorName: round.candidate.creatorName,
    hasResumeFile: Boolean(round.candidate.resumeStorageKey),
    id: round.candidate.id,
    interviewQuestions: round.candidate.interviewQuestions,
    jobDescriptionId: round.candidate.jobDescriptionId,
    jobDescriptionName: round.candidate.jobDescriptionName,
    notes: round.candidate.notes,
    outcome: round.candidate.outcome,
    pipelineStage: round.candidate.pipelineStage,
    resumeFileName: round.candidate.resumeFileName,
    resumeProfile: round.candidate.resumeProfile ?? null,
    resumeStorageKey: round.candidate.resumeStorageKey,
    roundAllowTextInput: round.allowTextInput,
    roundCandidateFeedback: round.candidateFeedback,
    roundHasReport: round.hasReport,
    roundId: round.id,
    roundInterviewLink: round.interviewLink,
    roundLabel: round.roundLabel,
    roundScheduledAt: round.scheduledAt,
    roundScheduledEndAt: round.scheduledEndAt,
    roundStatus: round.status,
    targetRole: round.candidate.targetRole,
  };
}
