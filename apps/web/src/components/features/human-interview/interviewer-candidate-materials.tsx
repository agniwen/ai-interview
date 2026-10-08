"use client";

import {
  CandidateQuestionProgress,
  candidateQuestionsQueryKey,
} from "./candidate-question-progress";
import {
  IconAlertTriangle,
  IconFileDescription,
  IconListDetails,
  IconX,
} from "@tabler/icons-react";
import type { QualitativeResumeEvaluationV2 } from "@app/db-schema/qualitative-resume-evaluation";
import { getResumeDocumentKind } from "@app/shared/resume-documents";
import { cn } from "@app/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { DataField } from "@/components/features/display/data-field";
import { DataFields } from "@/components/features/display/data-fields";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { CandidateResumePreview } from "./candidate-resume-preview";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchHumanInterviewCandidateAiEvaluation,
  fetchHumanInterviewCandidateHrInformation,
  fetchHumanInterviewCandidateMaterialDetail,
  fetchHumanInterviewCandidateMaterials,
  fetchHumanInterviewCandidateQuestions,
  getHumanInterviewCandidatePptxPreviewUrl,
  getHumanInterviewCandidateResumeUrl,
} from "@/lib/client/api";
import { resolveEffectiveCandidateId } from "./human-meeting-materials-model";
import { CandidateInterviewHistory } from "./candidate-interview-history";
import { CandidateQuestionsPanel } from "./candidate-questions-panel";

const InlinePdfViewer = lazy(async () => {
  const mod = await import("@/components/ui/pdf-viewer");
  return { default: mod.PDFViewer };
});

const InlineDocxViewer = lazy(async () => {
  const mod = await import("@/components/ui/docx-viewer");
  return { default: mod.DocxViewerPreview };
});

const InlineXlsxViewer = lazy(async () => {
  const mod = await import("@/components/ui/xlsx-viewer");
  return { default: mod.XlsxViewerPreview };
});

const InlineImageViewer = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ImageResumePreviewContent };
});

export interface InterviewerCandidateMaterialsState {
  candidateId: string | null;
  questionsOpen: boolean;
}

interface InterviewerCandidateMaterialsProps {
  showQuestions?: boolean;
  active: boolean;
  headerActionsContainer?: HTMLElement | null;
  inviteToken: string;
  onStateChange: (state: InterviewerCandidateMaterialsState) => void;
  state: InterviewerCandidateMaterialsState;
}

const MATERIALS_QUERY_OPTIONS = {
  gcTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
} as const;

function LoadingBlock() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="加载中">
      <Skeleton className="h-24 w-full" variant="subtle" />
      <Skeleton className="h-16 w-full" variant="subtle" />
      <Skeleton className="h-16 w-full" variant="subtle" />
    </div>
  );
}

function ErrorBlock({ error, title }: { error: unknown; title: string }) {
  const message = error instanceof Error ? error.message : "请稍后重试。";
  return (
    <Alert className="m-4" variant="destructive">
      <IconAlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function EmptyBlock({ description, title }: { description?: string; title: string }) {
  return (
    <Empty className="min-h-52 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconFileDescription />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

export function AiEvaluationContent({
  data,
}: {
  data: { aiEvaluation: { evaluation: QualitativeResumeEvaluationV2; status: "ready" } };
}) {
  const { evaluation } = data.aiEvaluation;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 py-3 md:grid-cols-2">
      {(
        [
          ["judgment", "判断"],
          ["matchingEvidence", "匹配依据"],
          ["risks", "风险与待确认项"],
        ] as const
      ).map(([key, label]) => (
        <section className={cn("min-w-0", key === "judgment" && "md:col-span-2")} key={key}>
          <h3 className="font-semibold text-base md:text-sm">{label}</h3>
          <RestrictedMarkdownView
            className="mt-2 text-base leading-7 md:text-sm md:leading-6"
            content={evaluation.detailedOverall[key]}
          />
        </section>
      ))}
    </div>
  );
}

function CandidateEvaluations({
  compact,
  query,
  aiQuery,
  resumePreview,
}: {
  compact: boolean;
  resumePreview: ReactNode;
  query: ReturnType<typeof useHrInformationQuery>;
  aiQuery: ReturnType<typeof useAiEvaluationQuery>;
}) {
  const aiEvaluation =
    aiQuery.data?.aiEvaluation.status === "ready" ? (
      <AiEvaluationContent data={{ aiEvaluation: aiQuery.data.aiEvaluation }} />
    ) : null;
  const aiStatus = (
    <>
      {aiQuery.isPending ? <LoadingBlock /> : null}
      {aiQuery.isError ? <ErrorBlock error={aiQuery.error} title="AI 评价加载失败" /> : null}
    </>
  );
  if (query.isPending || query.isError) {
    return (
      <ScrollArea className="h-full" scrollFade scrollbars="leave">
        <div className="mx-auto w-full max-w-5xl">
          {resumePreview}
          {aiStatus}
          {aiEvaluation}
          {query.isPending ? (
            <LoadingBlock />
          ) : (
            <ErrorBlock error={query.error} title="历史评价加载失败" />
          )}
        </div>
      </ScrollArea>
    );
  }
  return (
    <CandidateInterviewHistory
      compact={compact}
      status={aiStatus}
      resumePreview={resumePreview}
      aiEvaluation={aiEvaluation}
      aiEvaluationGeneratedAt={aiQuery.data?.generatedAt}
      data={query.data}
    />
  );
}

function CandidateQuestions({
  query,
  inviteToken,
  candidateId,
}: {
  query: ReturnType<typeof useQuestionsQuery>;
  inviteToken: string;
  candidateId: string;
}) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="面试题参考加载失败" />;
  }
  if (query.data.interviewQuestions.length === 0) {
    return <EmptyBlock title="暂无面试题参考" />;
  }
  return (
    <CandidateQuestionProgress
      key={candidateId}
      data={query.data}
      inviteToken={inviteToken}
      candidateId={candidateId}
    />
  );
}

function ResumeViewToggle({ onClick, structured }: { onClick: () => void; structured: boolean }) {
  const label = structured ? "查看简历原件" : "展示结构化数据";
  return (
    <Button
      aria-label={label}
      aria-pressed={structured}
      className="h-8 shrink-0 px-2 has-[>svg]:px-2"
      onClick={onClick}
      size="sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {structured ? (
        <IconFileDescription className="size-4" />
      ) : (
        <IconListDetails className="size-4" />
      )}
      <span className="hidden xl:inline">{label}</span>
    </Button>
  );
}

function CandidateDetail({
  query,
  toolbarAction,
}: {
  query: ReturnType<typeof useOverviewQuery>;
  toolbarAction: ReactNode;
}) {
  if (query.isPending) {
    return <LoadingBlock />;
  }
  if (query.isError) {
    return <ErrorBlock error={query.error} title="候选人详情加载失败" />;
  }
  const { candidate } = query.data;
  const candidateName = candidate.candidateName.trim() || "未命名候选人";
  const avatarLabel =
    candidate.candidateName.trim() || candidate.candidateEmail?.trim() || "候选人";
  const avatarValue = avatarLabel.slice(0, 1).toUpperCase();
  return (
    <ScrollArea className="h-full" scrollFade scrollbars="leave">
      <div className="flex flex-col gap-8 p-5 lg:p-7">
        <header className="flex min-w-0 items-center gap-3">
          <Avatar
            className="size-14 shrink-0"
            generatedSize={56}
            label={`${avatarLabel}的头像`}
            seed={candidateName}
          >
            <AvatarFallback>{avatarValue}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <h2 className="truncate font-semibold text-2xl tracking-normal">{candidateName}</h2>
              <span className="font-normal text-[14px] text-muted-foreground/60">
                ({formatResumeRecordDisplayId(candidate.id)})
              </span>
            </div>
            <p className="mt-2 truncate text-muted-foreground text-sm">
              {candidate.jobDescriptionName ?? candidate.targetRole ?? "未关联岗位"}
            </p>
          </div>
          <div className="ml-auto shrink-0 self-start">{toolbarAction}</div>
        </header>

        <section className="border-border/50 border-t pt-6">
          <h3 className="mb-3 font-medium text-sm">候选人信息</h3>
          <DataFields columns={3} density="compact">
            <DataField label="姓名" value={candidateName} />
            <DataField label="关联岗位" value={candidate.jobDescriptionName} />
            <DataField label="求职意向" value={candidate.targetRole} />
            <DataField kind="email" label="邮箱" value={candidate.candidateEmail} />
            <DataField kind="phone" label="电话" value={candidate.candidatePhone} />
            <DataField label="创建人" value={candidate.creatorName} />
          </DataFields>
        </section>

        <section className="border-border/50 border-t pt-6">
          <ResumeProfileView
            profile={candidate.resumeProfile}
            showBasicInfo={false}
            showTargetRoles={false}
          />
        </section>
      </div>
    </ScrollArea>
  );
}

type InlineResumeKind = "docx" | "image" | "pdf" | "pptx" | "xlsx";

function InlineResumeDocument({
  fileName,
  isDark,
  kind,
  onIsDarkChange,
  sourceUrl,
  toolbarAction,
  compact = false,
  toolbarContainer,
}: {
  fileName: string | undefined;
  isDark: boolean;
  kind: InlineResumeKind;
  onIsDarkChange: (isDark: boolean) => void;
  sourceUrl: string;
  toolbarAction: ReactNode;
  compact?: boolean;
  toolbarContainer?: HTMLElement | null;
}) {
  if (kind === "pdf" || kind === "pptx") {
    return (
      <InlinePdfViewer
        className="h-full"
        enableModifierWheelZoom
        enableTouchPinchZoom
        file={sourceUrl}
        fitWidthOnMobile
        scrollFade
        showToolbar={!compact}
        showDownload={false}
        showRotateControlsOnMobile={false}
        showSearchOnMobile={false}
        showUpload={false}
        toolbarActions={toolbarAction}
        toolbarContainer={toolbarContainer}
      />
    );
  }
  if (kind === "docx") {
    return (
      <InlineDocxViewer
        className="h-full"
        fileName={fileName}
        isDark={isDark}
        onIsDarkChange={onIsDarkChange}
        showToolbar={!compact}
        showDownload={false}
        showUpload={false}
        src={sourceUrl}
        toolbarActions={toolbarAction}
      />
    );
  }
  if (kind === "xlsx") {
    return (
      <InlineXlsxViewer
        className="h-full"
        fileName={fileName}
        isDark={isDark}
        onIsDarkChange={onIsDarkChange}
        showToolbar={!compact}
        showDownload={false}
        showUpload={false}
        src={sourceUrl}
        toolbarActions={toolbarAction}
      />
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 justify-end p-2">{toolbarAction}</div>
      <ScrollArea className="min-h-0 flex-1" scrollFade scrollbars="leave">
        <InlineImageViewer filename={fileName} url={sourceUrl} />
      </ScrollArea>
    </div>
  );
}

function ResumePreviewFallback({
  children,
  toolbarAction,
}: {
  children: ReactNode;
  toolbarAction: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 justify-end p-2">{toolbarAction}</div>
      {children}
    </div>
  );
}

function ResumePreview({
  query,
  inviteToken,
  toolbarAction,
  compact = false,
  toolbarContainer,
}: {
  query: ReturnType<typeof useOverviewQuery>;
  inviteToken: string;
  toolbarAction: ReactNode;
  compact?: boolean;
  toolbarContainer?: HTMLElement | null;
}) {
  const [isDark, setIsDark] = useState(false);
  if (query.isPending) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <LoadingBlock />
      </ResumePreviewFallback>
    );
  }
  if (query.isError) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <ErrorBlock error={query.error} title="简历信息加载失败" />
      </ResumePreviewFallback>
    );
  }
  const { candidate } = query.data;
  if (!candidate.hasResumeFile) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <EmptyBlock title="候选人未上传简历文件" />
      </ResumePreviewFallback>
    );
  }
  const kind = getResumeDocumentKind({ fileName: candidate.resumeFileName ?? undefined });
  if (
    !(kind === "pdf" || kind === "pptx" || kind === "docx" || kind === "xlsx" || kind === "image")
  ) {
    return (
      <ResumePreviewFallback toolbarAction={toolbarAction}>
        <EmptyBlock
          description={`${candidate.resumeFileName ?? "当前文件"} 的格式暂不支持在线预览，会议资料页不提供下载。`}
          title="无法预览这份简历"
        />
      </ResumePreviewFallback>
    );
  }
  const sourceUrl =
    kind === "pptx"
      ? getHumanInterviewCandidatePptxPreviewUrl(inviteToken, candidate.id)
      : getHumanInterviewCandidateResumeUrl(inviteToken, candidate.id);

  return (
    <Suspense fallback={<LoadingBlock />}>
      <InlineResumeDocument
        compact={compact}
        toolbarContainer={toolbarContainer}
        fileName={candidate.resumeFileName ?? undefined}
        isDark={isDark}
        kind={kind}
        onIsDarkChange={setIsDark}
        sourceUrl={sourceUrl}
        toolbarAction={toolbarAction}
      />
    </Suspense>
  );
}

function CandidateResumeDialog({
  open,
  onClose,
  query,
  inviteToken,
}: {
  open: boolean;
  onClose: () => void;
  query: ReturnType<typeof useOverviewQuery>;
  inviteToken: string;
}) {
  const isMobile = useIsMobile();
  const [pdfToolbarContainer, setPdfToolbarContainer] = useState<HTMLDivElement | null>(null);
  const [showStructuredResume, setShowStructuredResume] = useState(false);
  const resumeViewToggle = (
    <ResumeViewToggle
      onClick={() => setShowStructuredResume((current) => !current)}
      structured={showStructuredResume}
    />
  );
  return (
    <Modal
      open={open}
      onOpenChange={() => onClose()}
      size="full"
      fullScreen
      bodyClassName="overflow-hidden p-0"
      title={
        isMobile ? (
          "简历详情"
        ) : (
          <span className="flex min-w-0 items-center gap-3 text-sm">
            <ResumeDocumentFileIcon
              className="size-5 shrink-0"
              kind={getResumeDocumentFileIconKind({
                fileName: query.data?.candidate.resumeFileName,
              })}
            />
            <span className="sr-only">简历详情</span>
            <span
              className="truncate font-normal text-muted-foreground"
              title={query.data?.candidate.resumeFileName ?? undefined}
            >
              {query.data?.candidate.resumeFileName}
            </span>
          </span>
        )
      }
      headerClassName="md:px-3 md:py-2"
      showCloseButton={false}
      headerLayout="row"
      headerExtra={
        <div className="flex items-center gap-2">
          <div className="hidden md:block" ref={setPdfToolbarContainer} />
          {!isMobile && showStructuredResume ? resumeViewToggle : null}
          <Button aria-label="关闭简历详情" onClick={() => onClose()} size="icon" variant="ghost">
            <IconX />
          </Button>
        </div>
      }
    >
      <div className="h-full min-h-0" data-vaul-no-drag>
        {showStructuredResume ? (
          <CandidateDetail query={query} toolbarAction={isMobile ? resumeViewToggle : null} />
        ) : (
          <ResumePreview
            toolbarContainer={isMobile ? undefined : pdfToolbarContainer}
            inviteToken={inviteToken}
            query={query}
            toolbarAction={resumeViewToggle}
          />
        )}
      </div>
    </Modal>
  );
}

function useOverviewQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateMaterialDetail(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "overview"],
  });
}

function useAiEvaluationQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateAiEvaluation(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "ai-evaluation"],
  });
}

function useHrInformationQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateHrInformation(inviteToken, candidateId ?? ""),
    queryKey: ["human-interview-candidate-materials", inviteToken, candidateId, "history"],
  });
}

function useQuestionsQuery(active: boolean, inviteToken: string, candidateId: string | null) {
  return useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active && Boolean(candidateId),
    queryFn: () => fetchHumanInterviewCandidateQuestions(inviteToken, candidateId ?? ""),
    queryKey: candidateQuestionsQueryKey(inviteToken, candidateId),
    refetchInterval: active ? 5000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function InterviewerCandidateMaterials({
  showQuestions = false,
  active,
  headerActionsContainer,
  inviteToken,
  onStateChange,
  state,
}: InterviewerCandidateMaterialsProps) {
  const isMobile = useIsMobile();
  const questionsPanelId = useId();
  const questionsButtonRef = useRef<HTMLButtonElement>(null);
  const questionsOpen = showQuestions && state.questionsOpen;
  const desktopQuestionsOpen = questionsOpen && !isMobile;
  const closeQuestions = () => {
    onStateChange({ ...state, questionsOpen: false });
    questionsButtonRef.current?.focus();
  };
  const [resumeDialogCandidateId, setResumeDialogCandidateId] = useState<string | null>(null);
  const listQuery = useQuery({
    ...MATERIALS_QUERY_OPTIONS,
    enabled: active,
    queryFn: () => fetchHumanInterviewCandidateMaterials(inviteToken),
    queryKey: ["human-interview-candidate-materials", inviteToken, "candidates"],
  });
  const candidates = listQuery.data?.candidates ?? [];
  const effectiveCandidateId = resolveEffectiveCandidateId(candidates, state.candidateId);
  const overviewQuery = useOverviewQuery(active, inviteToken, effectiveCandidateId);
  const aiQuery = useAiEvaluationQuery(active, inviteToken, effectiveCandidateId);
  const hrQuery = useHrInformationQuery(active, inviteToken, effectiveCandidateId);
  const questionsQuery = useQuestionsQuery(
    active && showQuestions,
    inviteToken,
    effectiveCandidateId,
  );
  if (listQuery.isPending) {
    return <LoadingBlock />;
  }
  if (listQuery.isError) {
    return <ErrorBlock error={listQuery.error} title="候选人资料不可用" />;
  }
  if (!effectiveCandidateId) {
    return <EmptyBlock title="这场会议暂未关联候选人" />;
  }

  const candidateSelector =
    candidates.length > 1 ? (
      <Select
        onValueChange={(candidateId) => {
          setResumeDialogCandidateId(null);
          onStateChange({ ...state, candidateId: String(candidateId) });
        }}
        value={effectiveCandidateId}
      >
        <SelectTrigger aria-label="切换候选人" className="mx-2 mt-2 w-auto max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                <span>{candidate.candidateName}</span>
                {candidate.targetRole ? (
                  <span className="text-muted-foreground">· {candidate.targetRole}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    ) : null;
  const actionsInHeader = headerActionsContainer !== undefined;
  const questionsButton = showQuestions ? (
    <Button
      ref={questionsButtonRef}
      aria-label="面试题"
      className="max-md:[&_svg]:size-5"
      aria-controls={questionsPanelId}
      aria-expanded={questionsOpen}
      onClick={() => onStateChange({ ...state, questionsOpen: !questionsOpen })}
      size="sm"
      variant={questionsOpen ? "secondary" : "ghost"}
    >
      <IconListDetails data-icon="inline-start" />
      <span>面试题</span>
    </Button>
  ) : null;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {candidateSelector}
      {actionsInHeader
        ? headerActionsContainer && createPortal(questionsButton, headerActionsContainer)
        : showQuestions && (
            <div className="flex shrink-0 justify-end px-3 py-2">{questionsButton}</div>
          )}
      <div
        className={cn(
          "grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-200 ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
          desktopQuestionsOpen
            ? "grid-cols-[minmax(0,1fr)_min(32%,30rem)]"
            : "grid-cols-[minmax(0,1fr)_0px]",
        )}
      >
        <section aria-label="候选人概览" className="min-h-0 min-w-0 overflow-hidden">
          <CandidateEvaluations
            compact={desktopQuestionsOpen}
            key={effectiveCandidateId}
            aiQuery={aiQuery}
            query={hrQuery}
            resumePreview={
              <CandidateResumePreview
                candidate={overviewQuery.data?.candidate}
                onOpen={() => {
                  setResumeDialogCandidateId(effectiveCandidateId);
                }}
              >
                <ResumePreview
                  compact
                  inviteToken={inviteToken}
                  query={overviewQuery}
                  toolbarAction={null}
                />
              </CandidateResumePreview>
            }
          />
        </section>
        {showQuestions ? (
          <CandidateQuestionsPanel
            id={questionsPanelId}
            isMobile={isMobile}
            open={questionsOpen}
            onClose={closeQuestions}
          >
            <CandidateQuestions
              query={questionsQuery}
              inviteToken={inviteToken}
              candidateId={effectiveCandidateId ?? ""}
            />
          </CandidateQuestionsPanel>
        ) : null}
      </div>
      <CandidateResumeDialog
        key={effectiveCandidateId}
        open={resumeDialogCandidateId === effectiveCandidateId}
        onClose={() => setResumeDialogCandidateId(null)}
        query={overviewQuery}
        inviteToken={inviteToken}
      />
    </div>
  );
}
