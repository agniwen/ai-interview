"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ComponentProps, ComponentType, CSSProperties, PropsWithChildren } from "react";
import type { ResumeReviewLoose } from "@arc/shared/resume-review";
import type { StructuredResumeReview } from "@arc/shared/recruiting-copilot";
import type { QualitativeResumeEvaluation } from "@arc/db-schema/qualitative-resume-evaluation";
import type { JobEvaluationMode } from "@arc/db-schema/job-description-evaluation";
import type { RecruitingActionProposal } from "@/lib/client/api";
import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
import { ResumeDocumentPreviewDialog as DefaultResumeDocumentPreviewDialog } from "@/components/features/resume/resume-document-preview-dialog";
import type { ResumeDocumentPreviewDialogProps } from "@/components/features/resume/resume-document-preview-dialog";
import { ResumePoolDetailDialog } from "@/components/features/studio/resume-pool/resume-pool-detail-dialog-shell";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import type { StudioPersonDetailTab } from "@/components/features/studio/studio-person-detail-panel";
import { useHasPermission } from "@/hooks/use-has-permission";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

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

export interface RecruitingCopilotContextProviderDependencies {
  ResumeDocumentPreviewDialog: ComponentType<ResumeDocumentPreviewDialogProps>;
  StudioPersonDetailDialog: ComponentType<ComponentProps<typeof StudioPersonDetailDialog>>;
}

const defaultDependencies: RecruitingCopilotContextProviderDependencies = {
  ResumeDocumentPreviewDialog: DefaultResumeDocumentPreviewDialog,
  StudioPersonDetailDialog,
};

export interface SearchResumeRecordsResult {
  candidateSummaryCards?: CandidateSummaryCard[];
  citations?: CopilotCitation[];
  retrievalMode?: "combined" | "semantic" | "structured" | "structured_text";
  semanticHitCount?: number;
  total?: number;
}

export interface ResumeRecordDetailResult {
  missingIds?: string[];
  /** Legacy persisted tool results used the singular field. */
  resumeRecord?: ResumeRecordToolDetail | null;
  resumeRecords?: ResumeRecordToolDetail[];
}

export interface ResumeRecordToolDetail {
  candidateName: string;
  citation: CopilotCitation;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  qualitativeResumeEvaluation?: QualitativeResumeEvaluation | null;
  resumeEvaluationArtifactMode?: JobEvaluationMode | null;
  resumeReview?: ResumeReviewLoose | null;
  structuredResumeReview?: StructuredResumeReview | null;
}

export interface CopilotCitation {
  id: string;
  label: string;
  recordType: "job_description" | "resume_pool_item" | "resume_record";
  secondaryLabel: string | null;
}

export type {
  RecruitingActionConfirmation,
  RecruitingActionProposal,
  RecruitingActionProposalResult,
} from "@/lib/client/api";

export type ProposalStatus = "confirmed" | "failed" | "ignored" | "pending";

export interface CandidateDetailTarget {
  id: string;
  kind: "resume_pool" | "resume_record";
}

export interface RecruitingCopilotContextValue {
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

export const RecruitingCopilotContext = createContext<RecruitingCopilotContextValue | null>(null);

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
  dependencies = defaultDependencies,
}: PropsWithChildren<{
  conversationId: string | null;
  dependencies?: RecruitingCopilotContextProviderDependencies;
}>) {
  const {
    ResumeDocumentPreviewDialog: PreviewDialog,
    StudioPersonDetailDialog: PersonDetailDialog,
  } = dependencies;
  const [citations, setCitations] = useState<CopilotCitation[]>([]);
  const [detailTarget, setDetailTarget] = useState<
    | { defaultTab: StudioPersonDetailTab; kind: "resume_record"; recordId: string }
    | { itemId: string; kind: "resume_pool" }
    | null
  >(null);
  const [resumeDetailOpen, setResumeDetailOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<Pick<
    CandidateSummaryCard,
    "id" | "resumeFileName"
  > | null>(null);
  const [proposals, setProposals] = useState<RecruitingActionProposal[]>([]);
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, ProposalStatus>>({});
  const [stateConversationId, setStateConversationId] = useState(conversationId);
  const canImportResumePool = useHasPermission("resumePool", "import");
  const canReadJobDescriptions = useHasPermission("jd", "read");

  if (stateConversationId !== conversationId) {
    setStateConversationId(conversationId);
    setCitations([]);
    setDetailTarget(null);
    setResumeDetailOpen(false);
    setPreviewRecord(null);
    setProposals([]);
    setProposalStatuses({});
  }

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
      setResumeDetailOpen(false);
      setDetailTarget({ itemId, kind: "resume_pool" });
      return;
    }
    setDetailTarget({ defaultTab: "overview", kind: "resume_record", recordId: target.id });
    setResumeDetailOpen(true);
  }, []);

  const openResumeDetail = useCallback(
    (recordId: string, defaultTab: StudioPersonDetailTab = "overview") => {
      setDetailTarget({ defaultTab, kind: "resume_record", recordId });
      setResumeDetailOpen(true);
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
      {resumeDetailTarget ? (
        <PersonDetailDialog
          defaultTab={resumeDetailTarget.defaultTab}
          mode="resume"
          onOpenChange={setResumeDetailOpen}
          onOpenChangeComplete={(open) => {
            if (!open) {
              setDetailTarget(null);
            }
          }}
          open={resumeDetailOpen}
          recordId={resumeDetailTarget.recordId}
        />
      ) : null}
      {poolDetailTarget ? (
        <ResumePoolDetailDialog
          canRecommend={canImportResumePool && canReadJobDescriptions}
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
      ) : null}
      {previewRecord && previewKind ? (
        <PreviewDialog
          filename={previewRecord.resumeFileName ?? undefined}
          kind={previewKind}
          onOpenChange={(open) => !open && setPreviewRecord(null)}
          open={previewRecord !== null}
          url={`/api/w/${slug}/studio/resumes/${previewRecord.id}/resume`}
        />
      ) : null}
    </RecruitingCopilotContext.Provider>
  );
}

type ThreadStyle = CSSProperties & { "--thread-max-width": string };

export const activeThreadStyle: ThreadStyle = {
  "--thread-max-width": "48rem",
};
