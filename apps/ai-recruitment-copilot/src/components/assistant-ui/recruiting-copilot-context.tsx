"use client";

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, PropsWithChildren } from "react";
import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

export interface CandidateSummaryCard {
  candidateName: string;
  hasResumeFile?: boolean;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  keySkills: string[];
  notes: string | null;
  pipelineStage: string;
  resumeFileName?: string | null;
  resumeSummary: string | null;
  targetRole: string | null;
  updatedAt: string;
  workYears: number | null;
}

export interface SearchResumeRecordsResult {
  candidateSummaryCards?: CandidateSummaryCard[];
  citations?: CopilotCitation[];
  retrievalMode?: "combined" | "semantic" | "structured" | "structured_text";
  semanticHitCount?: number;
  total?: number;
}

export interface CopilotCitation {
  id: string;
  label: string;
  recordType: "job_description" | "resume_pool_item" | "resume_record";
  secondaryLabel: string | null;
}

export interface RecruitingActionProposal {
  explanation: string;
  id: string;
  payload: Record<string, unknown>;
  title: string;
  type: "bind_candidate_to_job" | "advance_candidate_stage" | "generate_interview_questions";
}

export interface RecruitingActionProposalResult {
  proposal?: RecruitingActionProposal;
}

export type ProposalStatus = "confirmed" | "failed" | "ignored" | "pending";

interface RecruitingCopilotContextValue {
  citations: CopilotCitation[];
  conversationId: string | null;
  proposalStatuses: Record<string, ProposalStatus>;
  proposals: RecruitingActionProposal[];
  markProposal: (id: string, status: ProposalStatus) => void;
  openResumeDetail: (recordId: string) => void;
  openResumePreview: (record: Pick<CandidateSummaryCard, "id" | "resumeFileName">) => void;
  upsertCitations: (citations: CopilotCitation[]) => void;
  upsertProposal: (proposal: RecruitingActionProposal) => void;
}

const RecruitingCopilotContext = createContext<RecruitingCopilotContextValue | null>(null);

export function useRecruitingCopilotContext() {
  const context = useContext(RecruitingCopilotContext);
  if (!context) {
    throw new Error("RecruitingCopilotContext is missing.");
  }
  return context;
}

function mergeByKey<T>(current: T[], incoming: T[], keyOf: (value: T) => string): T[] {
  const map = new Map(current.map((item) => [keyOf(item), item]));
  for (const item of incoming) {
    map.set(keyOf(item), item);
  }
  return [...map.values()];
}

export function RecruitingCopilotContextProvider({
  children,
  conversationId,
}: PropsWithChildren<{ conversationId: string | null }>) {
  const [citations, setCitations] = useState<CopilotCitation[]>([]);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<Pick<
    CandidateSummaryCard,
    "id" | "resumeFileName"
  > | null>(null);
  const [proposals, setProposals] = useState<RecruitingActionProposal[]>([]);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalStatus>>({});

  useEffect(() => {
    setCitations([]);
    setDetailRecordId(null);
    setPreviewRecord(null);
    setProposals([]);
    setProposalStatuses({});
  }, [conversationId]);

  const upsertCitations = useCallback((next: CopilotCitation[]) => {
    if (next.length === 0) {
      return;
    }
    setCitations((current) =>
      mergeByKey(current, next, (citation) => `${citation.recordType}:${citation.id}`),
    );
  }, []);

  const upsertProposal = useCallback((proposal: RecruitingActionProposal) => {
    setProposals((current) => mergeByKey(current, [proposal], (item) => item.id));
    setProposalStatuses((current) => ({
      ...current,
      [proposal.id]: current[proposal.id] ?? "pending",
    }));
  }, []);

  const markProposal = useCallback((id: string, status: ProposalStatus) => {
    setProposalStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const openResumeDetail = useCallback((recordId: string) => {
    setDetailRecordId(recordId);
  }, []);

  const openResumePreview = useCallback(
    (record: Pick<CandidateSummaryCard, "id" | "resumeFileName">) => {
      setPreviewRecord(record);
    },
    [],
  );

  const value = useMemo(
    () => ({
      citations,
      conversationId,
      markProposal,
      openResumeDetail,
      openResumePreview,
      proposalStatuses,
      proposals,
      upsertCitations,
      upsertProposal,
    }),
    [
      citations,
      conversationId,
      markProposal,
      openResumeDetail,
      openResumePreview,
      proposalStatuses,
      proposals,
      upsertCitations,
      upsertProposal,
    ],
  );

  const previewKind = previewRecord
    ? getPreviewableResumeDocumentKind({ fileName: previewRecord.resumeFileName })
    : null;
  const slug = useWorkspaceSlug();

  return (
    <RecruitingCopilotContext.Provider value={value}>
      {children}
      <StudioPersonDetailDialog
        mode="resume"
        onOpenChange={(open) => {
          if (!open) {
            setDetailRecordId(null);
          }
        }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />
      {previewRecord && previewKind ? (
        <Suspense fallback={null}>
          <ResumeDocumentPreviewDialog
            filename={previewRecord.resumeFileName ?? undefined}
            kind={previewKind}
            onOpenChange={(open) => !open && setPreviewRecord(null)}
            open={previewRecord !== null}
            url={`/api/w/${slug}/studio/resumes/${previewRecord.id}/resume`}
          />
        </Suspense>
      ) : null}
    </RecruitingCopilotContext.Provider>
  );
}

export const activeThreadStyle = {
  "--thread-max-width": "48rem",
} as CSSProperties;

export const composerSendButtonClass =
  "size-9 rounded-full bg-primary p-0 text-primary-foreground hover:bg-primary/90 disabled:border-input disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100";
