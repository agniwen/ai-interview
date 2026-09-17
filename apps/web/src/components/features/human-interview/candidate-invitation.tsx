import { InterviewEntryShell } from "./interview-entry-shell";
import { CandidateInterviewOverview } from "./candidate-interview-overview";
import { Button } from "@/components/ui/button";

interface CandidateInvitationProps {
  candidateName: string;
  companyContext?: string | null;
  jobDescriptionName: string | null;
  jobDescriptionPrompt: string | null;
  roundLabel: string;
  scheduledAt: string | null;
  canRespond: boolean;
  pending: boolean;
  message?: string;
  onRespond: (response: "accept" | "decline") => Promise<void>;
}

export function CandidateInvitation({
  candidateName,
  companyContext,
  jobDescriptionName,
  jobDescriptionPrompt,
  roundLabel,
  scheduledAt,
  canRespond,
  pending,
  message,
  onRespond,
}: CandidateInvitationProps) {
  return (
    <InterviewEntryShell>
      <CandidateInterviewOverview
        candidateName={candidateName}
        companyContext={companyContext}
        jobDescriptionName={jobDescriptionName}
        jobDescriptionPrompt={jobDescriptionPrompt}
        roundLabel={roundLabel}
        scheduledAt={scheduledAt}
        message={canRespond ? `${candidateName}，请确认是否参加本次面试。` : message}
      >
        {canRespond ? (
          <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
            <Button
              className="min-w-36"
              disabled={pending}
              onClick={() => onRespond("accept")}
              size="lg"
            >
              {pending ? "处理中…" : "确认参加"}
            </Button>
            <Button
              className="min-w-36"
              disabled={pending}
              onClick={() => onRespond("decline")}
              size="lg"
              variant="outline"
            >
              无法参加
            </Button>
          </div>
        ) : null}
      </CandidateInterviewOverview>
    </InterviewEntryShell>
  );
}
