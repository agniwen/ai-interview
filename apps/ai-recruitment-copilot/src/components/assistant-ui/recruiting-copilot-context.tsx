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
import type { ResumeReviewLoose } from "@arc/shared/resume-review";
import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import type { StudioPersonDetailTab } from "@/components/features/studio/studio-person-detail-panel";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

const ResumePoolDetailDialog = lazy(async () => {
  const mod = await import("@/components/features/studio/resume-pool/resume-pool-details");
  return { default: mod.ResumePoolDetailDialog };
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

export interface ResumeRecordDetailResult {
  resumeRecord?: {
    candidateName: string;
    citation: CopilotCitation;
    id: string;
    jobDescriptionId: string | null;
    jobDescriptionName: string | null;
    resumeReview?: ResumeReviewLoose | null;
  } | null;
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
  type:
    | "bind_candidate_to_job"
    | "bind_pool_item_to_job"
    | "advance_candidate_stage"
    | "generate_interview_questions";
}

export interface RecruitingActionConfirmation {
  confirmedAt: string;
  jobDescriptionId?: string;
  jobDescriptionName?: string | null;
  status: "confirmed" | "ignored";
}

export interface RecruitingActionProposalResult {
  confirmation?: RecruitingActionConfirmation;
  proposal?: RecruitingActionProposal;
}

export type ProposalStatus = "confirmed" | "failed" | "ignored" | "pending";

export interface CandidateDetailTarget {
  id: string;
  kind: "resume_pool" | "resume_record";
}

interface RecruitingCopilotContextValue {
  citations: CopilotCitation[];
  conversationId: string | null;
  proposalStatuses: Record<string, ProposalStatus>;
  proposals: RecruitingActionProposal[];
  markProposal: (id: string, status: ProposalStatus) => void;
  openCandidateDetail: (target: CandidateDetailTarget) => void;
  openResumeDetail: (recordId: string, defaultTab?: StudioPersonDetailTab) => void;
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

export function useRecruitingCopilotContextOptional() {
  return useContext(RecruitingCopilotContext);
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
}: PropsWithChildren<{
  conversationId: string | null;
}>) {
  const [citations, setCitations] = useState<CopilotCitation[]>([]);
  const [detailTarget, setDetailTarget] = useState<
    | { defaultTab: StudioPersonDetailTab; kind: "resume_record"; recordId: string }
    | { itemId: string; kind: "resume_pool" }
    | null
  >(null);
  const [previewRecord, setPreviewRecord] = useState<Pick<
    CandidateSummaryCard,
    "id" | "resumeFileName"
  > | null>(null);
  const [proposals, setProposals] = useState<RecruitingActionProposal[]>([]);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalStatus>>({});

  useEffect(() => {
    setCitations([]);
    setDetailTarget(null);
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

  const openCandidateDetail = useCallback((target: CandidateDetailTarget) => {
    if (target.kind === "resume_pool") {
      const itemId = target.id.startsWith("pool:") ? target.id.slice("pool:".length) : target.id;
      setDetailTarget({ itemId, kind: "resume_pool" });
      return;
    }
    setDetailTarget({ defaultTab: "overview", kind: "resume_record", recordId: target.id });
  }, []);

  const openResumeDetail = useCallback(
    (recordId: string, defaultTab: StudioPersonDetailTab = "overview") => {
      setDetailTarget({ defaultTab, kind: "resume_record", recordId });
    },
    [],
  );

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
      openCandidateDetail,
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
      openCandidateDetail,
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
  const { data: session } = authClient.useSession();
  const resumeDetailTarget = detailTarget?.kind === "resume_record" ? detailTarget : null;
  const poolDetailTarget = detailTarget?.kind === "resume_pool" ? detailTarget : null;

  return (
    <RecruitingCopilotContext.Provider value={value}>
      {children}
      <StudioPersonDetailDialog
        defaultTab={resumeDetailTarget?.defaultTab}
        mode="resume"
        onOpenChange={(open) => {
          if (!open) {
            setDetailTarget(null);
          }
        }}
        open={resumeDetailTarget !== null}
        recordId={resumeDetailTarget?.recordId}
      />
      {poolDetailTarget ? (
        <Suspense fallback={null}>
          <ResumePoolDetailDialog
            currentUserId={session?.user.id ?? null}
            onOpenChange={(open) => {
              if (!open) {
                setDetailTarget(null);
              }
            }}
            record={null}
            recordId={poolDetailTarget.itemId}
            slug={slug}
          />
        </Suspense>
      ) : null}
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
